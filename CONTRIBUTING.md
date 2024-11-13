# Contributing

## Getting Started
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

## Development Workflow

1. Create a new branch for your feature or bug fix.
2. Make your changes and commit them (see How to Commit).
3. Push your changes and submit a pull request.

## How to commit

This repo uses [Semantic Release](https://github.com/semantic-release/semantic-release) with Conventional Commits.
Releases are automatically created based on the type of commit message: feat for minor and fix for patch.

```
feat: new feature ---> 1.x.0
fix: fix a bug ---> 1.0.x
```

Please format your commit messages accordingly.

## Pull Request Process

1. Ensure your code adheres to the project's coding standards.
2. Update the Docs with details of changes, if applicable.
3. Your pull request will be reviewed by maintainers, who may request changes or provide feedback.

## Code of Conduct
Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Questions?
If you have any questions or need further clarification on the contribution process, please open a new discussion or contact the maintainers.

*Thank you for contributing to Turborepo Remote Cache!*
