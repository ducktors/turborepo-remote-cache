---
layout: default
title: HTTP/2 support
nav_order: 6
---

## When HTTP/2 is needed

Some platforms have payload size limits for HTTP/1 connections. For example, Cloud Run has a [32 MiB request size limit](https://cloud.google.com/run/quotas#request_limits). However, when HTTP/2 is used, payload size is not limited.

## Caution

The service must be configured to use end-to-end HTTP/2 for this option to work.

For Cloud Run, please refer to the [official documentation](https://cloud.google.com/run/docs/configuring/http2#setting).

## How to enable HTTP/2 server

Set the **HTTP2** environment variable to **true**.
