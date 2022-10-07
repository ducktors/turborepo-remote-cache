![Turborepo Remote Cache](https://user-images.githubusercontent.com/6388707/149501949-9a385f04-ec94-45f4-9ea9-d211be123071.png)

![GitHub package.json version](https://img.shields.io/github/package-json/v/ducktors/turborepo-remote-cache) [![CI](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/build.yml/badge.svg)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/build.yml) [![Release](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/release.yml/badge.svg)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/release.yml) [![Docker](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/docker.yml/badge.svg)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/docker.yml) [![Coverage Status](https://coveralls.io/repos/github/ducktors/turborepo-remote-cache/badge.svg?branch=main)](https://coveralls.io/github/ducktors/turborepo-remote-cache?branch=main) [![Docker Pulls](https://img.shields.io/docker/pulls/fox1t/turborepo-remote-cache?logo=docker)](https://hub.docker.com/r/fox1t/turborepo-remote-cache) [![npm](https://img.shields.io/npm/dt/turborepo-remote-cache)]([https://img.shields.io/npm/dt/turborepo-remote-cache](https://www.npmjs.com/package/turborepo-remote-cache)) <!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-6-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->


This project is an open-source implementation of the [Turborepo custom remote cache server](https://turborepo.org/docs/features/remote-caching#custom-remote-caches). If Vercel's official cache server isn't a viable option, this server is an alternative for self-hosted deployments.
It supports several storage providers and deploys environments. Moreover, the project provides __"deploy to "__ buttons for one-click deployments whenever possible.

## Index
- [Supported Storage Providers](https://ducktors.github.io/turborepo-remote-cache/supported-storage-providers)
- [Environment variables](#environment-variables)
- [Deployment Instructions](https://ducktors.github.io/turborepo-remote-cache/deployment-environments)
- [Enable custom remote caching in a Turborepo monorepo](https://ducktors.github.io/turborepo-remote-cache/enable-custom-remote-caching-in-your-turborepo-monorepo)

## Supported Storage Providers
- [x] Local filesystem
- [x] AWS S3
- [x] Google Cloud Storage
- [ ] Azure Blob Storage (PR welcome)
- [ ] Google Drive Blobs (PR welcome)

[Full documentation is available here](https://ducktors.github.io/turborepo-remote-cache/supported-storage-providers)

## Environment variables

- `NODE_ENV`: String. Optional. Possible values: `development | production`. Default value: `production`.
- `PORT`: Number. Optional. Default value: `3000`.
- `TURBO_TOKEN`: String. Secret token used for the authentication. The value must be the same one provided for the `token` parameter of the `build` script. See [Enable custom remote caching in a Turborepo monorepo](#enable-custom-remote-caching-in-your-turborepo-monorepo) for more info. This value should be private.
- `LOG_LEVEL`: String. Optional. Default value: `'info'`
- `STORAGE_PROVIDER`: Optional. Possible values: `local | s3 | google-cloud-storage`. Default value: "local". Use this var to choose the storage provider.
- `STORAGE_PATH`: String. Caching folder. If `STORAGE_PROVIDER` is set to `s3` or `google-cloud-storage`, this will be the name of the bucket.

## Contribute to this project
1. clone this repository

    `git clone git@github.com:ducktors/turborepo-remote-cache.git`

2. `cd turborepo-remote-cache`
3. `npm i`
4. `cp .env.example .env`
5. put your env vars to the `env` file. See [ENV_VARS](#env-vars) section for more details.
6. `npm run dev`

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://maksim.dev"><img src="https://avatars.githubusercontent.com/u/1620916?v=4?s=100" width="100px;" alt="Maksim Sinik"/><br /><sub><b>Maksim Sinik</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=fox1t" title="Code">💻</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=fox1t" title="Tests">⚠️</a> <a href="#ideas-fox1t" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-fox1t" title="Maintenance">🚧</a> <a href="#mentoring-fox1t" title="Mentoring">🧑‍🏫</a></td>
      <td align="center"><a href="http://matteovivona.it"><img src="https://avatars.githubusercontent.com/u/6388707?v=4?s=100" width="100px;" alt="Matteo Vivona"/><br /><sub><b>Matteo Vivona</b></sub></a><br /><a href="#infra-tehKapa" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#security-tehKapa" title="Security">🛡️</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=tehKapa" title="Documentation">📖</a></td>
      <td align="center"><a href="https://github.com/dlehmhus"><img src="https://avatars.githubusercontent.com/u/27899554?v=4?s=100" width="100px;" alt="Dario Lehmhus"/><br /><sub><b>Dario Lehmhus</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=dlehmhus" title="Code">💻</a></td>
      <td align="center"><a href="https://github.com/lodmfjord"><img src="https://avatars.githubusercontent.com/u/5091589?v=4?s=100" width="100px;" alt="lommi"/><br /><sub><b>lommi</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=lodmfjord" title="Code">💻</a></td>
      <td align="center"><a href="https://www.brianmuenzenmeyer.com"><img src="https://avatars.githubusercontent.com/u/298435?v=4?s=100" width="100px;" alt="Brian Muenzenmeyer"/><br /><sub><b>Brian Muenzenmeyer</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=bmuenzenmeyer" title="Documentation">📖</a></td>
      <td align="center"><a href="http://dobesv.com"><img src="https://avatars.githubusercontent.com/u/327833?v=4?s=100" width="100px;" alt="Dobes Vandermeer"/><br /><sub><b>Dobes Vandermeer</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=dobesv" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

