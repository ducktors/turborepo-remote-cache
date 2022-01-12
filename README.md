# Turborepo Remote Cache

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffox1t%2Fturborepo-remote-cache&env=NODE_ENV,TURBO_TOKEN,STORAGE_PROVIDER,STORAGE_PATH,S3_ACCESS_KEY,S3_SECRET_KEY,S3_REGION,S3_ENDPOINT&envDescription=The%20server%20needs%20several%20credentials.%20The%20required%20environmental%20variables%20can%20be%20found%20here%3A&envLink=https%3A%2F%2Fgithub.com%2Ffox1t%2Fturborepo-remote-cache%23readme)

## Run turborepo-remote-cache server
1. clone this repo: `git clone git@github.com:fox1t/turborepo-remote-cache.git`
2. `cd turborepo-remote-cache`
3. `npm i`
4. `cp env.example env`
5. add env vars to the `env` file.
    - `TOKEN` var is mandatory and it is the same value you will use when running `turbo build` command
6. `npm run dev`

## Enable remote caching in turborepo monorepo
1. create `.turbo` folder at the root of your monorepo
2. add `config.json` file with the following properties:
    - `teamId`: any string that starts with `"team_"`
    - `apiUrl`: address of running `turborepo-remote-cache` server

For example:
```
{
  "teamId": "team_FcALQN9XEVbeJ1NjTQoS9Wup",
  "apiUrl": "http://localhost:3000"
}
```
3. Add a known token to the top level `build` script: `"build": "turbo run build --token=\"yourtoken\"",`
