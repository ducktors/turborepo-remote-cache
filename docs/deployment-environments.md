---
layout: default
title: Deployment Environments
nav_order: 4
has_children: true
has_toc: false
---

# Deployment Environments

- [Deploy on Vercel](#deploy-on-vercel)
- [Deploy on Docker](#deploy-on-docker)
- [Deploy on DigitalOcean](#deploy-on-digitalocean)
- [Deploy on AWS Lambda](#deploy-on-aws-lambda)
- [Remoteless with npx](#deploy-remoteless-with-npx)

## Deploy on Vercel
The server can be easily deployed as a Vercel Serverless Function using the deploy button.

__Note: Local storage isn't supported for this deployment method.__

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fducktors%2Fturborepo-remote-cache&env=NODE_ENV,TURBO_TOKEN,STORAGE_PROVIDER,STORAGE_PATH,S3_ACCESS_KEY,S3_SECRET_KEY,S3_REGION,S3_ENDPOINT&envDescription=The%20server%20needs%20several%20credentials.%20The%20required%20environmental%20variables%20can%20be%20found%20here%3A&envLink=https%3A%2F%2Fgithub.com%2Fducktors%2Fturborepo-remote-cache%23readme)

## Deploy on Docker
You can find the image on the [dockerhub](https://hub.docker.com/r/ducktors/turborepo-remote-cache).

1. create an `.env` file containing all the env vars you need. Check [environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables) for more info.
```sh
NODE_ENV=
PORT=
TURBO_TOKEN=
LOG_LEVEL=
STORAGE_PROVIDER=
STORAGE_PATH=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_ENDPOINT=
```
2. run the image using the `.env` file created on the step one.
```sh
docker run --env-file=.env -p 3000:3000 ducktors/turborepo-remote-cache
```

## Deploy on DigitalOcean
The server can be easily deployed on DigitalOcean App Services.

__Note: Local storage isn't supported for this deployment method.__

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/ducktors/turborepo-remote-cache/tree/main)

## Deploy on AWS Lambda
This server can be deployed as an AWS Lambda Function. See this
[guide](https://ducktors.github.io/turborepo-remote-cache/running-in-lambda) on deployment steps.

## Deploy "remoteless" with npx
If you have Node.js installed, you can run the server simply by typing

```bash
npx turborepo-remote-cache
```
**Note**: Same env vars rules apply as for other deployments.

