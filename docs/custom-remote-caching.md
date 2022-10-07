# Enable custom remote caching in your Turborepo monorepo

To enable a custom remote caching server in your Turborepo monorepo, you must add a config file by hand. The `turbo login` command works only with the official Vercel server.

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
  3. Modify your Turborepo top-level `build` script, adding the `--token=` parameter.
  __Note: The token value must be the same used for your `TURBO_TOKEN` env var. See [ENV_VARS](#env-vars) section for more info.__

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

## Enable remote caching in Docker
For some reason, the `.turbo/config.json` is not working in Docker containers. In order to enable remote caching in Docker, you need to pass the configuration via CLI arguments.

```json
    "build": "turbo run build --team=\"team_awesome\" --token=\"turbotoken\" --api=\"https://your-caching.server.dev\"",
```
and add this to your `Dockerfile` before calling the `turbo run build` command:
```docker
ENV VERCEL_ARTIFACTS_TOKEN=turbotoken
ENV VERCEL_ARTIFACTS_OWNER=team_awesome
```
