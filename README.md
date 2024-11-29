---
![TURBOREPO REMOTE CACHE](https://user-images.githubusercontent.com/1620916/216358708-cb0a18c6-4f5b-4565-a101-77ee89272180.png)

---

![remote_cache_1](https://user-images.githubusercontent.com/1620916/216358421-36a63b0e-d1f6-484f-a4ca-6a7119cc0816.jpg)

[![GitHub package.json version](https://img.shields.io/github/package-json/v/ducktors/turborepo-remote-cache)](https://github.com/ducktors/turborepo-remote-cache/releases) ![node:20.18.1](https://img.shields.io/badge/node-20.18.1-lightgreen) ![pnpm@9.14.2](https://img.shields.io/badge/pnpm-9.14.2-yellow) [![CI](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/ci.yml) [![Test](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/test.yaml/badge.svg)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/test.yaml) [![Release](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/release.yml/badge.svg)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/release.yml) [![Docker](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/docker.yml/badge.svg)](https://github.com/ducktors/turborepo-remote-cache/actions/workflows/docker.yml) [![Maintainability](https://api.codeclimate.com/v1/badges/bbb26ca5247dee70dde0/maintainability)](https://codeclimate.com/github/ducktors/turborepo-remote-cache/maintainability) [![Coverage Status](https://coveralls.io/repos/github/ducktors/turborepo-remote-cache/badge.svg?branch=main)](https://coveralls.io/github/ducktors/turborepo-remote-cache?branch=main) [![Docker Pulls](https://img.shields.io/docker/pulls/ducktors/turborepo-remote-cache?logo=docker)](https://hub.docker.com/r/ducktors/turborepo-remote-cache) [![npm](https://img.shields.io/npm/dt/turborepo-remote-cache)](https://www.npmjs.com/package/turborepo-remote-cache) [![semantic-release: angular](https://img.shields.io/badge/semantic--release-angular-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/ducktors/turborepo-remote-cache/badge)](https://securityscorecards.dev/viewer/?uri=github.com/ducktors/turborepo-remote-cache) <!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-30-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

This project is an open-source implementation of the [Turborepo custom remote cache server](https://turbo.build/repo/docs/core-concepts/remote-caching#self-hosting). If Vercel's official cache server isn't a viable option, this server is an alternative for self-hosted deployments.
It supports several storage providers and deploys environments. Moreover, the project provides **"deploy to "** buttons for one-click deployments whenever possible.

## Notable projects that use TRRC

- [GitHub Actions](https://github.com/trappar/turborepo-remote-cache-gh-action)
- [Lambda](https://github.com/cvle/turborepo-cache-lambda)
- [AWS CDK Construct](https://github.com/NimmLor/cdk-turborepo-remote-cache)

## Documentation

- [Supported Storage Providers](https://ducktors.github.io/turborepo-remote-cache/supported-storage-providers)
- [Environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables)
- [Deployment Instructions](https://ducktors.github.io/turborepo-remote-cache/deployment-environments)
- [Enable custom remote caching in a Turborepo monorepo](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching)

[Full documentation is available here](https://ducktors.github.io/turborepo-remote-cache/supported-storage-providers)

## Contribute to this project

1. Clone this repository

   `git clone git@github.com:ducktors/turborepo-remote-cache.git`

2. Move inside repository folder

   `cd turborepo-remote-cache`

3. Install dependencies

   `pnpm install`

4. Copy example variables

   `cp .env.example .env`

5. Put your env vars to the `env` file. See [Environment variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables) section for more details.

6. Run the project in development mode

   `pnpm dev`

## How to commit

This repo uses [Semantic Release](https://github.com/semantic-release/semantic-release) with Conventional Commits.
Releases are automatically created based on the type of commit message: feat for minor and fix for patch.

```
feat: new feature ---> 1.x.0
fix: fix a bug ---> 1.0.x
```

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://maksim.dev"><img src="https://avatars.githubusercontent.com/u/1620916?v=4?s=100" width="100px;" alt="Maksim Sinik"/><br /><sub><b>Maksim Sinik</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=fox1t" title="Code">💻</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=fox1t" title="Tests">⚠️</a> <a href="#ideas-fox1t" title="Ideas, Planning, & Feedback">🤔</a> <a href="#maintenance-fox1t" title="Maintenance">🚧</a> <a href="#mentoring-fox1t" title="Mentoring">🧑‍🏫</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://matteovivona.it"><img src="https://avatars.githubusercontent.com/u/6388707?v=4?s=100" width="100px;" alt="Matteo Vivona"/><br /><sub><b>Matteo Vivona</b></sub></a><br /><a href="#infra-matteovivona" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#security-matteovivona" title="Security">🛡️</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=matteovivona" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/dlehmhus"><img src="https://avatars.githubusercontent.com/u/27899554?v=4?s=100" width="100px;" alt="Dario Lehmhus"/><br /><sub><b>Dario Lehmhus</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=dlehmhus" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/lodmfjord"><img src="https://avatars.githubusercontent.com/u/5091589?v=4?s=100" width="100px;" alt="lommi"/><br /><sub><b>lommi</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=lodmfjord" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.brianmuenzenmeyer.com"><img src="https://avatars.githubusercontent.com/u/298435?v=4?s=100" width="100px;" alt="Brian Muenzenmeyer"/><br /><sub><b>Brian Muenzenmeyer</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=bmuenzenmeyer" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://dobesv.com"><img src="https://avatars.githubusercontent.com/u/327833?v=4?s=100" width="100px;" alt="Dobes Vandermeer"/><br /><sub><b>Dobes Vandermeer</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=dobesv" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://tanzigang.com"><img src="https://avatars.githubusercontent.com/u/11520821?v=4?s=100" width="100px;" alt="Tan Zi Gang"/><br /><sub><b>Tan Zi Gang</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=zigang93" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jgoz"><img src="https://avatars.githubusercontent.com/u/132233?v=4?s=100" width="100px;" alt="John Gozde"/><br /><sub><b>John Gozde</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=jgoz" title="Code">💻</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=jgoz" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/sppatel"><img src="https://avatars.githubusercontent.com/u/989367?v=4?s=100" width="100px;" alt="Sachin Patel"/><br /><sub><b>Sachin Patel</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=sppatel" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.andrewsnagy.com"><img src="https://avatars.githubusercontent.com/u/564256?v=4?s=100" width="100px;" alt="Andrew Nagy"/><br /><sub><b>Andrew Nagy</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=tm1000" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/emalihin"><img src="https://avatars.githubusercontent.com/u/6379998?v=4?s=100" width="100px;" alt="Eugene Malihins"/><br /><sub><b>Eugene Malihins</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=emalihin" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://joedevivo.com"><img src="https://avatars.githubusercontent.com/u/55951?v=4?s=100" width="100px;" alt="Joe DeVivo"/><br /><sub><b>Joe DeVivo</b></sub></a><br /><a href="#infra-joedevivo" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.aoe.com"><img src="https://avatars.githubusercontent.com/u/1044246?v=4?s=100" width="100px;" alt="Daniel Kopp"/><br /><sub><b>Daniel Kopp</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=devtribe" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/tom-fletcher"><img src="https://avatars.githubusercontent.com/u/16312830?v=4?s=100" width="100px;" alt="Tom Fletcher"/><br /><sub><b>Tom Fletcher</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=tom-fletcher" title="Code">💻</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=tom-fletcher" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Klaitos"><img src="https://avatars.githubusercontent.com/u/644360?v=4?s=100" width="100px;" alt="Christopher Brookes"/><br /><sub><b>Christopher Brookes</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=Klaitos" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/izi-p"><img src="https://avatars.githubusercontent.com/u/10976962?v=4?s=100" width="100px;" alt="Pierre S."/><br /><sub><b>Pierre S.</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=izi-p" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://danielmitrov.com"><img src="https://avatars.githubusercontent.com/u/21154704?v=4?s=100" width="100px;" alt="Daniel Mitrov"/><br /><sub><b>Daniel Mitrov</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=danielmitrov" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/adriantr"><img src="https://avatars.githubusercontent.com/u/48787209?v=4?s=100" width="100px;" alt="Adrian Trzeciak"/><br /><sub><b>Adrian Trzeciak</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=adriantr" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://nimmervoll.work/"><img src="https://avatars.githubusercontent.com/u/32486857?v=4?s=100" width="100px;" alt="Lorenz Nimmervoll"/><br /><sub><b>Lorenz Nimmervoll</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=NimmLor" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/gtjamesa"><img src="https://avatars.githubusercontent.com/u/2078364?v=4?s=100" width="100px;" alt="James"/><br /><sub><b>James</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=gtjamesa" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/warflash"><img src="https://avatars.githubusercontent.com/u/22006082?v=4?s=100" width="100px;" alt="Nils Wiesinger"/><br /><sub><b>Nils Wiesinger</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=warflash" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Naoto-Ida"><img src="https://avatars.githubusercontent.com/u/7748110?v=4?s=100" width="100px;" alt="Naoto Ida"/><br /><sub><b>Naoto Ida</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=Naoto-Ida" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/gustavoam-asdf"><img src="https://avatars.githubusercontent.com/u/53370174?v=4?s=100" width="100px;" alt="Gustavo Atencio Mauricio"/><br /><sub><b>Gustavo Atencio Mauricio</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=gustavoam-asdf" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/EWhite613"><img src="https://avatars.githubusercontent.com/u/9057680?v=4?s=100" width="100px;" alt="Eric White"/><br /><sub><b>Eric White</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=EWhite613" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/SaniMusic"><img src="https://avatars.githubusercontent.com/u/11148959?v=4?s=100" width="100px;" alt="Sani Music"/><br /><sub><b>Sani Music</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=SaniMusic" title="Documentation">📖</a> <a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=SaniMusic" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/konclave"><img src="https://avatars.githubusercontent.com/u/875116?v=4?s=100" width="100px;" alt="Ivan Vasilev"/><br /><sub><b>Ivan Vasilev</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=konclave" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://linktr.ee/nullvoxpopuli"><img src="https://avatars.githubusercontent.com/u/199018?v=4?s=100" width="100px;" alt="NullVoxPopuli"/><br /><sub><b>NullVoxPopuli</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=NullVoxPopuli" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mattref"><img src="https://avatars.githubusercontent.com/u/137362246?v=4?s=100" width="100px;" alt="Matt"/><br /><sub><b>Matt</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=mattref" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://www.linkedin.com/in/luca-taddeo/"><img src="https://avatars.githubusercontent.com/u/23079973?v=4?s=100" width="100px;" alt="Luca Taddeo"/><br /><sub><b>Luca Taddeo</b></sub></a><br /><a href="#maintenance-lucalas" title="Maintenance">🚧</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/thyming"><img src="https://avatars.githubusercontent.com/u/2217705?v=4?s=100" width="100px;" alt="Luke Rohde"/><br /><sub><b>Luke Rohde</b></sub></a><br /><a href="https://github.com/ducktors/turborepo-remote-cache/commits?author=thyming" title="Code">💻</a></td>
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
