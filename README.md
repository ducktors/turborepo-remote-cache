# Turborepo Remote Cache Server


This project is an open-source implementation of the [Turborepo custom remote cache server](https://turborepo.org/docs/features/remote-caching#custom-remote-caches). If Vercel's official cache server isn't a viable option, this server is an alternative for self-hosted deployments.
It supports several storage providers and deploys environments. Moreover, the project provides __"deploy to "__ buttons for one-click deployments whenever possible.

## Index
- [Supported Storage Providers](#supported-storage-providers)
- [ENV VARS](#env-vars)
- [Deployment Instructions](#deployment-environments)
- [Enable custom remote caching in a Turborepo monorepo](#enable-custom-remote-caching-in-your-turborepo-monorepo)

## Supported Storage Providers
- [x] Local filesystem
- [x] AWS S3
- [ ] Azure Blob Storage (WIP)
- [ ] Google Cloud Storage (WIP)
- [ ] Google Drive Blobs (WIP)

## ENV VARS

- `NODE_ENV`: String. Optional. Possible values: `development | production`. Default value: `production`.
- `PORT`: Number. Optional. Default value: `3000`.
- `TURBO_TOKEN`: String. Secret token used for the authentication. The value must be the same one provided for the `token` parameter of the `build` script. See [Enable custom remote caching in a Turborepo monorepo](#enable-custom-remote-caching-in-your-turborepo-monorepo) for more info. This value should be private.
- `LOG_LEVEL`: String. Optional. Default value: `'info'`
- `STORAGE_PROVIDER`: Optional. Possible values: `local | s3`. Default value: "local". Use this var to choose the storage provider.
- `STORAGE_PATH`: String. Caching folder. If `STORAGE_PROVIDER` is set to `s3`, this will be the name of the bucket.
- `S3_ACCESS_KEY`: String. Used only if `STORAGE_PROVIDER=s3`
- `S3_SECRET_KEY`: String. Used only if `STORAGE_PROVIDER=s3`
- `S3_REGION`: String. Used only if `STORAGE_PROVIDER=s3`
- `S3_ENDPOINT`: String. Optional. Used only if `STORAGE_PROVIDER=s3`. __NOTE: This var can be omitted if the other s3 vars are provided.__

## Deployment Environments
- [Deploy on Vercel](#deploy-on-vercel)
- [Deploy on Docker](#deploy-on-docker)

## Enable custom remote caching in your Turborepo monorepo
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
  ```json
  //...
    "build": "turbo run build --token=\"yourToken\"",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  //...
  ```

## Deploy on Vercel
The server can be easily deployed as Vercel Function using the deploy button.

__Note: Local storage isn't supported for this deployment method.__

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffox1t%2Fturborepo-remote-cache&env=NODE_ENV,TURBO_TOKEN,STORAGE_PROVIDER,STORAGE_PATH,S3_ACCESS_KEY,S3_SECRET_KEY,S3_REGION,S3_ENDPOINT&envDescription=The%20server%20needs%20several%20credentials.%20The%20required%20environmental%20variables%20can%20be%20found%20here%3A&envLink=https%3A%2F%2Fgithub.com%2Ffox1t%2Fturborepo-remote-cache%23readme)

## Deploy on Docker
You can find the image on the [dockerhub](https://hub.docker.com/r/fox1t/turborepo-remote-cache).


1. create an `.env` file, containing all of the env vars you need. Check [ENV_VARS](#env-vars) for more info.
```sh
NODE_ENV=
PORT=
TURBO_TOKEN=
LOG_LEVEL=
STORAGE_PROVIDER=
STORAGE_PATH=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=
S3_ENDPOINT=
```
2. run the image using the `.env` file created on the step one.
```sh
docker run --env-file=.env -p 3000:3000 fox1t/turborepo-remote-cache
```
## Contribute to this project
1. clone this repository

    `git clone git@github.com:fox1t/turborepo-remote-cache.git`

2. `cd turborepo-remote-cache`
3. `npm i`
4. `cp env.example env`
5. put your env vars to the `env` file. See [ENV_VARS](#env-vars) section for more details.
6. `npm run dev`

