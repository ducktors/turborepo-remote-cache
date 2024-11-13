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

Now, you need to add these two environment variables TURBO_TEAM and TURBO_TOKEN to your CI pipeline or development machine. There are three ways to do it:

1. Set/export the `TURBO_TEAM=ducktors` and`TURBO_TOKEN=myGeneratedToken` as environment variable.
2. Add `teamid` and `token` to the *turbo* global config file. You can find or create it inside the `$XDG_CONFIG_HOME/turborepo/config.json`. To know where the`XDG_CONFIG_HOME` is located on your machine, please check out the [xdg-base-directory](https://github.com/adrg/xdg#xdg-base-directory) documentation. For example:

    `.turbo/config.json`

    ```json
    {
      "teamid": "ducktors",
      "token": "myGeneratedToken",
      "experimentalUI": false,
      "apiurl": "http://cache.ducktors.dev"
    }
    ```

3. Modify your project `package.json` scripts by adding the `--token=yourToken` parameter. __Note: This is a less secure way to do it because the token is committed inside the repository. Prefer the other two whenever possible.__

For example:

`package.json`
```jsonc
//...
  "build": "turbo run build --teamid=\"ducktors\" --token=\"myGeneratedToken\"",
  "dev": "turbo run dev --parallel",
  "lint": "turbo run lint",
  "format": "prettier --write \"**/*.{ts,tsx,md}\""
//...
```

__Note: The token value must be the same as for your server's `TURBO_TOKEN` env var. See the [environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables) section for more info.__


## Enable remote caching in Docker
To enable remote caching in Docker, you must pass `TURBO_TEAM` and `TURBO_TOKEN` inside Dockerfile as [build args](https://docs.docker.com/build/guide/build-args/).
For example:

```Dockerfile
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM

ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN

COPY turbo.json ./
COPY .turbo/config.json ./.turbo/

RUN --mount=type=bind,source=.git,target=.git \
    pnpm turbo build
```
and build your Remote Cache Server with this command:

```sh
docker buildx build --progress=plain --platform linux/amd64,linux/arm64 -f Dockerfile . --build-arg TURBO_TEAM=“ducktors” --build-arg TURBO_TOKEN=“myGeneratedToken“ --no-cache
```

## Local environment variables

You can also configure your development machine by setting the following environment variables instead of using the config file:

| Variable      | Type   | Description |
| ------------- | ------ | ----------- |
| `TURBO_API`   | string | The address of a running `turborepo-remote-cache` server |
| `TURBO_TEAM`  | string | The team (see *Config file* above)|
| `TURBO_TOKEN` | string | Your secret key. This must be the same as the `TURBO_TOKEN` variable set on your turborepo-remote-cache server instance |

**Note: these environment variables are used by the Turborepo CLI** on the development machine or CI pipelines. They are not used by the `turborepo-remote-cache` server.
