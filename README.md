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
