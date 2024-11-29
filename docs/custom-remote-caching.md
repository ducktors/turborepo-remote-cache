---
layout: default
title: Custom remote caching
nav_order: 5
---

# Enable custom remote caching in your Turborepo project

To enable a custom remote caching server in your Turborepo repository, you must
either add a config file by hand or set local environment variables.

## Config file

To enable remote caching, you must configure it by hand. In fact, the `turbo login` and `turbo link` commands work only with Vercel's remote cache.

First, you need to create the config file:

1. Create the `.turbo` folder at the root of your repository
2. Create the `config.json` file inside it, and add this property:
    - `apiurl`: the address of your `turborepo-remote-cache` server.

For example:

`.turbo/config.json`
```json
{
  "apiurl": "http://cache.ducktors.dev"
}
```

Now, you need to configure two additional environment variables, `TURBO_TEAM` and `TURBO_TOKEN`, within your development machine or CI pipeline. There are three ways to do it:

1. Set/export `TURBO_TEAM=ducktors` and `TURBO_TOKEN=myGeneratedToken` as environment variables.
2. Add `teamslug` and/or `token` to the `.turbo/config.json` file. __Note: Including the *token* here is a less secure way to do it if you plan to share or commit the config file. Prefer the TURBO_TOKEN environment variable whenever possible__. For example:

    `.turbo/config.json`

    ```json
    {
      "apiurl": "http://cache.ducktors.dev",
      "teamslug": "ducktors",
      "token": "myGeneratedToken"
    }
    ```
    - Setting the *TURBO_API*, *TURBO_TEAM*, and/or *TURBO_TOKEN* environment variables will __override__ the `apiurl`, `teamslug`, `token` properties of this file, respectively.

3. Modify your project `package.json` scripts by adding the `--team=yourTeam` and `--token=yourToken` parameters. __Note: This is a less secure way to do it because the token is committed inside the repository. Prefer the other two whenever possible.__

For example:

`package.json`
```jsonc
//...
  "build": "turbo run build --team=\"ducktors\" --token=\"myGeneratedToken\"",
  "dev": "turbo run dev --parallel",
  "lint": "turbo run lint",
  "format": "prettier --write \"**/*.{ts,tsx,md}\""
//...
```

__Note: The token value must be the same as for your server's `TURBO_TOKEN` env var. See the [environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables) section for more info.__


## Enable remote caching in Docker
To enable remote caching in Docker, you must pass `TURBO_TEAM` inside Dockerfile as [build arg](https://docs.docker.com/build/guide/build-args/) and `TURBO_TOKEN` as [build secret](https://docs.docker.com/build/building/secrets/) if you have *not* included them within `.turbo/config.json` or added them as parameters within `package.json` (see *Config file* above).

For example:

```Dockerfile
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM

ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN

COPY turbo.json ./
COPY .turbo/config.json ./.turbo/

RUN --mount=type=bind,source=.git,target=.git \
    --mount=type=secret,id=TURBO_TOKEN \
    TURBO_TOKEN=$(cat /run/secrets/TURBO_TOKEN) pnpm turbo build
```

and build your image leveraging Remote Cache Server with this command:

```sh
# TURBO_TOKEN is an env variable preferably set from CI secrets
docker buildx build --progress=plain \
    --platform linux/amd64,linux/arm64 \
    -f Dockerfile . \
    --build-arg TURBO_TEAM="ducktors" \
    --secret id=TURBO_TOKEN,env=TURBO_TOKEN \
    --no-cache
```

## Local environment variables

You can also configure your development machine by setting the following environment variables instead of using the config file:

| Variable      | Type   | Description |
| ------------- | ------ | ----------- |
| `TURBO_API`   | string | The address of a running `turborepo-remote-cache` server |
| `TURBO_TEAM`  | string | The team (see *Config file* above)|
| `TURBO_TOKEN` | string | Your secret key. This must be the same as the `TURBO_TOKEN` variable set on your turborepo-remote-cache server instance |

**Note: these environment variables are used by the Turborepo CLI** on the development machine or CI pipelines. They are not used by the `turborepo-remote-cache` server.
