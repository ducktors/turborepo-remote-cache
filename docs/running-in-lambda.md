---
layout: default
title: Running in an AWS Lambda Function
parent: Deployment Environments
nav_order: 1
---

# Running in an AWS Lambda Function

The server can be deployed to run in an AWS Lambda. The following steps take you
through creating:

- An S3 bucket to store the artifacts
- An IAM role to grant the Lambda permission to access the bucket
- The Lambda function
- A Lambda Function URL
- Configuring your repository to use the new API

## Create an S3 Bucket to store artifacts
First, create an S3 Bucket with a unique name, such as `turborepo-cache-udaw82`.
Leave **Block all public access** ticked to ensure your artifacts remain
private.

*Note: To prevent this bucket from growing forever, you may want to create a
**Lifecyle rule** to expire cache objects that are older than a certain number
of days.*

## Create an IAM role to grant the Lambda permission to access the bucket
Create a new IAM role. Under **Trusted entity type** choose **AWS service**, and
under **Use case** select **Lambda**. On the **Add permissions** screen, click
**Next**. On the **Name, review, and create** screen create a name for your role
such as `turborepo-cache-lambda-role` then click on **Create role**.

View your new role, and under **Permissions policies** click the button **Add
permissions** and choose **Create inline policy**. Click on **JSON** and add the
following policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:*"
            ],
            "Resource": [
                "arn:aws:s3:::<your_bucket_name>",
                "arn:aws:s3:::<your_bucket_name>/*"
            ]
        }
    ]
}
```

This will only grant the Lambda function access to the artifacts bucket, and no
other S3 resources.

Click on **Review policy** and give your policy a name such as
`turborepo-cache-lambda-policy`, then click on **Create Policy**.

## Create the Lambda Function

Create a new Lambda function with a name like `turborepo-cache-lambda` using the
latest Node.js runtime. Under **Permissions** click on **Change default
execution role**, select **Use an existing role** and select the role you just
created. Click on **Create function**.

### Handler code

Create a new package for your Lambda handler and add `turborepo-remote-cache`
as a dependency. Your `index.js` handler code should look like this:

```js
export { handler } from 'turborepo-remote-cache/aws-lambda';
```

*Note - You will need to bundle dependencies and upload the handler code. How
you choose to do this is outside the scope of this guide, but one method to
consider is using `esbuild`:*

```
esbuild src/index.js --bundle --platform=node --outfile=dist/index.js
```

### Configuration

Under your Lambda **Configuration**, edit the **General configuration** and
increase the timeout to 10 seconds (as the default value of 3 seconds can
sometimes cause timeouts).

Go into **Environment variables** and create the following environment
variables:

| Variable            | Value              |
|--------------------|--------------------|
| `STORAGE_PATH`     | *your_bucket_name* |
| `STORAGE_PROVIDER` | s3                 |
| `TURBO_TOKEN`      | *your_secret_key*  |

*See [Environment
variables](https://ducktors.github.io/turborepo-remote-cache/environment-variables)
for more information on configuring these.*

### Function URL

Under your Lambda **Configuration**, head to **Function URL** and click on **Create function URL**.

Select **Auth type**: `NONE`.

Open Additional settings and enable **CORS** with the following settings:

- Allow origin: `*`
- Allow headers: `*`
- Allow methods: `*`

Click on **Save**.

Copy the **Function URL** and use this to set up your repository.

## Configuring your repository to use the new API

You will need to enable custom remote caching in your turbo repository. Your
**Invoke URL** is your Turborepo API URL, see [Enable custom remote caching in a
Turborepo
monorepo](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching)
for more information on how to configure this.

Your remote `turborepo-remote-cache` API is now ready to use!
