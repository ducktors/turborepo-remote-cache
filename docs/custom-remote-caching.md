---
layout: default
title: Custom remote caching
nav_order: 5
---

# Enable custom remote caching in your Turborepo project

To enable a custom remote caching server in your Turborepo repository, you must
either add a config file by hand or set local environment variables.

## Config file

To enable the remote caching, you must configure it by hand. In fact, the `turbo login` and `turbo link` commands work only with Vercel's remote cache.

First of all, you need to create the config file:

1. Create the `.turbo` folder at the root of your repository
2. Create the `config.json` file inside it, and add these two properties:
    - `teamid`: it could be any string that starts with __`"team_"`__. This property will be used as a cache storage namespace for the current repository. Ex. `team_myteam`
    - `apiurl`: the address of your `turborepo-remote-cache` server.

For example:

`.turbo/config.json`
```json
{
  "teamid": "team_myteam",
  "apiurl": "http://localhost:3000"
}
```
Now, you need to add the remote cache server TURBO_TOKEN to your CI pipeline or development machine. There are three ways to do it:
1. Set the `TURBO_TOKEN=yourToken` environment variable
2. Add the token to the `turbo` global config file. You can find or create it inside the `$XDG_CONFIG_HOME/turborepo/config.json`. To know where the `XDG_CONFIG_HOME` is located on your machine, please check out the [xdg-base-directory](https://github.com/adrg/xdg#xdg-base-directory) documentation
3. Modify your project `package.json` scripts by adding the `--token=yourToken` parameter. __Note: this is the less secure way to do it because the token is committed inside the repository. Prefer the other two whenever possible.__

For example:

`package.json`
```jsonc
//...
  "build": "turbo run build --token=\"yourToken\"",
  "dev": "turbo run dev --parallel",
  "lint": "turbo run lint",
  "format": "prettier --write \"**/*.{ts,tsx,md}\""
//...
```

__Note: The token value must be the same used for your server's `TURBO_TOKEN` env var. See the [environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables) section for more info.__


## Enable remote caching in Docker
To enable remote caching in Docker, you must pass `TURBO_TOKEN` inside Dockerfile and [mount](https://docs.docker.com/build/guide/mounts/#add-bind-mounts) the `.git` folder to enable the turbo caching. The `.git` mount is accessible during the build stage only, and will not be present in the final image.
For example:

```
ENV TURBO_TOKEN=

COPY turbo.json ./
COPY .turbo/config.json ./.turbo/

RUN --mount=type=bind,source=.git,target=.git \
    pnpm turbo build
```

## Local environment variables

You can also configure your development machine by setting the following environment variables, instead of using the config file:

| Variable      | Type   | Description |
| ------------- | ------ | ----------- |
| `TURBO_API`   | string | The address of a running `turborepo-remote-cache` server |
| `TURBO_TEAM`  | string | The teamId (see *Config file* above)|
| `TURBO_TOKEN` | string | Your secret key. This must be the same as the `TURBO_TOKEN` variable set on your turborepo-remote-cache server instance |

**Note: these environment variables are used by the Turborepo CLI** on the development machine or CI pipelines. They are not used by the `turborepo-remote-cache` server.
