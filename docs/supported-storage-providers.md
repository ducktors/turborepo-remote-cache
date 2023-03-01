---
layout: default
title: Supported Storage Providers
nav_order: 3
---

# Supported Storage Providers

- [x] Local filesystem
- [x] AWS S3
- [x] Google Cloud Storage
- [x] Azure Blob Storage

## AWS S3

### Credentials and Region

AWS credentials and configuration are loaded as described in the AWS SDK documentation:

- [Setting Credentials](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [Setting Configuration](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-region.html)

For example, you can set environment variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or create a file
`~/.aws/credentials` with AWS credentials.

If running in an AWS Lambda Function, temporary credentials (including an
`AWS_SESSION_TOKEN`) are automatically created and you do not need to manually
configure these.

Specify the region using the `AWS_REGION` environment variable, or in `~/.aws/config`.


## Google Cloud Storage

1. Create a [bucket](https://console.cloud.google.com/storage/browser) (or use an existing one)
2. Create a new [service account](https://console.cloud.google.com/iam-admin/serviceaccounts).
3. Grant the role `Storage Object Admin` to the service account on the bucket.
  ```sh
  # .env
  STORAGE_PROVIDER=google-cloud-storage
  STORAGE_PATH=<name-of-the-bucket>
  ```
### Using static Service Account credentials

1. Click "Create Key" and save the JSON file.
1. Add the `project_id` , `client_email`, and `private_key` from saved JSON file to `.env` (or wherever you manage your environment variables):
  ```sh
  # .env
  GCS_PROJECT_ID=<project_id>
  GCS_CLIENT_EMAIL=<client_email>
  GCS_PRIVATE_KEY=<private_key>
  ```
### Using Application Default Credentials (ADC)

1. Do not set `GCS_*` environment variables
  ```sh
  # .env
  GCS_PROJECT_ID=
  GCS_CLIENT_EMAIL=
  GCS_PRIVATE_KEY=
  ```
  
##  Azure Blob Storage

1. Create a new Blob Storage
2. On "Security + networking" tab, copy one of `Connection string` on "Access keys" blade
3. Set `ABS_CONNECTION_STRING` with Connection string value
