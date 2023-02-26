---
layout: default
title: Custom remote caching
nav_order: 5
---

# Enable custom remote caching in your Turborepo monorepo

To enable a custom remote caching server in your Turborepo monorepo, you must
either add a config file by hand or set local environment variables.

## Config file

You must add the config file by hand. The `turbo login` command works only with the official Vercel server.

1. create `.turbo` folder at the root of your monorepo
2. create `config.json` file inside it, and add these properties:
    - `teamId`: it could be any string that starts with `"team_"`. This property will be used as a cache storage folder for the current repository. Ex. `team_myteam`
    - `apiUrl`: address of a running `turborepo-remote-cache` server.

For example:

`.turbo/config.json`
```json
{
  "teamId": "team_FcALQN9XEVbeJ1NjTQoS9Wup",
  "apiUrl": "http://localhost:3000"
}
```
  3. Modify your Turborepo top-level config. From v1.8.x you need to specify the TURBO_TOKEN in the `~/.config/turbo/config.json` folder on your machine.   
  
For example:

`.turbo/config.json`
```json
{
  "token": "token"
}
```
  __Note: The token value must be the same used for your `TURBO_TOKEN` env var. See [environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables) section for more info.__

## Enable remote caching in Docker
In order to enable remote caching in Docker, you need to tweak the Dockerfile like this:

```
ENV TURBO_TOKEN=token

COPY turbo.json ./
COPY .turbo/config.json ./.turbo/
COPY .git/ ./.git/

RUN pnpm turbo build
RUN rm -rf .git
```

## Local environment variables

You can also configure your developer environment by setting the following
environment variables:

| Variable      | Type   | Description |
| ------------- | ------ | ----------- |
| `TURBO_API`   | string | The address of a running `turborepo-remote-cache` server |
| `TURBO_TEAM`  | string | The team id (see *Config file* above)|
| `TURBO_TOKEN` | string | Your secret key. This must be the same as the `TURBO_TOKEN` variable set on your turborepo-remote-cache server |

**Note, these environment variables are used by the Turborepo CLI, so should not
be confused with the environment variables used to configure your server!**
