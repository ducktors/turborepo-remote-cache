import request from 'request'

export interface GitlabPackageRegistryOptions {
  gitlabToken?: string
  gitlabRepoPath?: string
  gitlabEndpoint?: string
}

export function createGitlabPackageRegistry({
  gitlabToken,
  gitlabRepoPath,
  gitlabEndpoint = 'https://gitlab.com/api/v4',
}: GitlabPackageRegistryOptions) {
  if (!gitlabToken || !gitlabRepoPath) {
    throw new Error(
      `To use GitlabPackageRegistry storage "token (GITLAB_TOKEN)", "repoPath (GITLAB_REPO_PATH)" parameters are mandatory.`,
    )
  }

  return {
    exists(artifactPath: string, callback: (err: Error | null, exists?: boolean) => void) {
      // GitLab doesn't support HEAD
      callback(null, true)
    },
    createReadStream(artifactPath: string) {
      return request({
        method: 'get',
        url: `${gitlabEndpoint}/projects/${encodeURIComponent(
          gitlabRepoPath,
        )}/packages/generic/turbo/0.0.1/${normalizeArtifactPath(artifactPath)}`,
        headers: {
          'PRIVATE-TOKEN': gitlabToken,
        },
      })
    },
    createWriteStream(artifactPath: string) {
      return request({
        method: 'put',
        url: `${gitlabEndpoint}/projects/${encodeURIComponent(
          gitlabRepoPath,
        )}/packages/generic/turbo/0.0.1/${normalizeArtifactPath(artifactPath)}`,
        headers: {
          'PRIVATE-TOKEN': gitlabToken,
        },
      })
    },
  }

  function normalizeArtifactPath(artifactPath: string) {
    // https://docs.gitlab.com/ee/user/packages/generic_packages/index.html#publish-a-generic-package-by-using-cicd
    // The filename. It can contain only lowercase letters (a-z), uppercase letter (A-Z), numbers (0-9), dots (.), hyphens (-), or underscores (_).
    return artifactPath.replace(/[^a-zA-Z0-9_-]+/g, '-')
  }
}
