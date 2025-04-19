---
layout: default
title: Deploying as a Cloud Run Service
nav_order: 6
---

# Deploying as a Cloud Run Service

This is a step-by-step guide on how to deploy your own cache server to Google Cloud as a Cloud Run service.

## Step 1: Create a Cloud Storage Bucket

Navigate to the [Cloud Storage buckets page](https://console.cloud.google.com/storage/browser) and create a new bucket with these settings:

- **Name**: Choose any valid name.
- **Location type**: Regional (select the region closest to you). Since this bucket is for cache data, high data durability isn't a priority.
- **Storage class**: Standard (as data is frequently accessed).
- **Prevent public access**: Enabled with **Uniform** access control (the bucket is only accessed by the Cloud Run service).
- **Data protection**: Set retention duration to **0 days**.

Additionally, after creating the bucket, consider setting a lifecycle rule to automatically delete objects older than a few weeks to remove stale cache data.

## Step 2: Deploy a Cloud Run Service

Navigate to the [Cloud Run admin page](https://console.cloud.google.com/run), click the **Deploy container** button, and select **Service**.

- Choose **Deploy one revision from an existing container image**, and enter the following container image URL: `ducktors/turborepo-remote-cache:latest`

This uses a [pre-built Docker image from Docker Hub](https://ducktors.github.io/turborepo-remote-cache/deployment-environments.html#deploy-on-docker).

- Select your closest region.
- Disable the option **Use Cloud IAM to authenticate incoming requests**, as authentication is managed by the service itself.
- Select **Request-based billing**.
- Set the **Minimum number of instances** to **0**.
- For the **Ingress** setting, select **All**.

### Container settings

- Set the container port to **3000**.
- Go to the **Volumes** tab, click **Add Volume**, set the type to **Cloud Storage bucket**, choose a name for the volume, and select the bucket created in step 1.
- Under the **Containers** tab, in the **Volume Mounts** section, click **Mount volume**, select the volume created above, and set the mount path to: `turbo-cache`
- Open the **Variables & Secrets** tab and add the following environment variables:

| Variable                      | Value             |
|-------------------------------|-------------------|
| `STORAGE_PROVIDER`            | local             |
| `STORAGE_PATH`                | /turbo-cache      |
| `STORAGE_PATH_USE_TMP_FOLDER` | false             |
| `TURBO_TOKEN`                 | *your_secret_key* |
| `HTTP2`                       | true              |

> **NOTE**: Replace *your_secret_key* with a strong, randomly-generated secret. For alternative authentication methods and additional configuration options, see the [Environment variables documentation](https://ducktors.github.io/turborepo-remote-cache/environment-variables)
- Under **Revision scaling**, set the minimum instances to **0** and maximum instances to **1**. This service uses a shared Cloud Storage bucket and has not been tested with multiple concurrent server instances.
- Navigate to the **Networking** tab and enable the **Use HTTP/2 end-to-end** option.

Once you've configured these settings, click **Create** to deploy your Cloud Run service.

## Step 3: Configure Turborepo to Use the Server

After deployment, copy the assigned URL from your Cloud Run service (ending with `.run.app`). This is the URL for your turborepo-remote-cache server.

To configure Turborepo to use this server, follow the instructions in [Enable custom remote caching in your Turborepo project](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching).

You'll need the `your_secret_key` from Step 2 if you chose static authentication.

#### About HTTP/2

Cloud Run has a [32 MiB request size limit](https://cloud.google.com/run/quotas#request_limits) if HTTP/2 is not enabled. To support artifacts larger than 32 MiB, ensure HTTP/2 is enabled.

If you prefer deploying without HTTP/2, remove the `HTTP2` environment variable and [disable the **Use HTTP/2 end-to-end** option](https://cloud.google.com/run/docs/configuring/http2#setting) in the Networking tab.
