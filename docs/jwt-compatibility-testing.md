---
layout: default
title: JWT Compatibility Testing
nav_order: 3
---

# JWT Compatibility Testing

This document describes the comprehensive JWT compatibility tests that validate the functionality and future compatibility of the JWT authentication system in the Turborepo Remote Cache server.

## Overview

The JWT compatibility tests (`test/jwt-compatibility.ts`) are designed to ensure that:

1. **JWT authentication works correctly** with the current `@fastify/jwt` version
2. **Future upgrades** to `@fastify/jwt` will be detected early if they break functionality
3. **All JWT features** are properly tested and validated
4. **Error handling** works correctly for various edge cases

## Test Categories

### 1. JWT Authentication Plugin Registration

Tests that validate the JWT authentication plugin is properly registered and configured:

- **Plugin Registration**: Verifies that JWT authentication is working by testing valid requests
- **Configuration Validation**: Ensures proper error handling when required configuration is missing (e.g., `JWKS_URL`)

### 2. JWT Token Validation and User Object Structure

Tests that validate JWT token processing and user object creation:

- **Token Decoding**: Verifies that JWT payloads are properly decoded
- **Scope Handling**: Tests JWT tokens with and without scope properties
- **User Object Creation**: Ensures the `formatUser` function correctly creates user objects

### 3. JWT Authorization Scopes Functionality

Tests that validate the scope-based authorization system:

- **Read Access**: Verifies that tokens with read scopes can access read operations
- **Write Access**: Verifies that tokens with write scopes can access write operations
- **Access Denial**: Ensures that tokens without required scopes are properly denied
- **Multiple Scopes**: Tests tokens with multiple scopes to ensure proper scope matching

### 4. JWT Error Handling and Edge Cases

Tests that validate proper error handling for various scenarios:

- **Malformed Tokens**: Ensures malformed JWT tokens are properly rejected
- **Invalid Tokens**: Tests rejection of tokens from different issuers
- **Missing Authorization**: Validates proper handling of missing authorization headers
- **Empty Headers**: Tests empty authorization headers
- **Non-Bearer Headers**: Ensures non-Bearer authorization schemes are rejected

### 5. JWT Integration with Storage Operations

Tests that validate JWT authentication works correctly with actual storage operations:

- **Artifact Upload**: Verifies JWT authentication works for artifact uploads
- **Artifact Download**: Tests JWT authentication for artifact downloads
- **HEAD Requests**: Validates JWT authentication for HEAD requests

### 6. JWT Configuration Validation

Tests that validate JWT configuration options work correctly:

- **Issuer Validation**: Tests JWT issuer (`iss`) claim validation
- **Audience Validation**: Tests JWT audience (`aud`) claim validation

## Running the Tests

To run the JWT compatibility tests specifically:

```bash
pnpm test jwt-compatibility.ts
```

To run all tests including JWT compatibility tests:

```bash
pnpm test
```

## Test Environment

The JWT compatibility tests use:

- **Mock JWKS Server**: Uses `mock-jwks` to simulate a JWKS endpoint
- **Test Environment**: Configured with JWT authentication mode and test JWKS URL
- **Isolated Storage**: Uses temporary local storage for testing

## Test Data

The tests use the following test data:

- **JWKS URL**: `http://test.com/.well-known/jwks.json`
- **Valid Issuer**: `http://test.com`
- **Invalid Issuer**: `http://other.com`
- **Test Scopes**: `artifacts:read`, `artifacts:write`, `other:scope`

## Future Compatibility

These tests are designed to catch compatibility issues when upgrading `@fastify/jwt` or related dependencies. Key areas monitored:

1. **Plugin Registration**: Ensures plugins are still properly registered
2. **Token Validation**: Validates JWT token processing still works
3. **User Object Structure**: Ensures the user object format remains compatible
4. **Error Handling**: Verifies error responses remain consistent
5. **Configuration Options**: Tests that configuration options still work as expected

## Troubleshooting

If JWT compatibility tests fail:

1. **Check Dependencies**: Ensure `@fastify/jwt` and `fastify-jwt-jwks` versions are compatible
2. **Verify Configuration**: Check that JWT configuration options are properly set
3. **Review Error Messages**: Test output includes detailed error information
4. **Check Mock JWKS**: Ensure the mock JWKS server is running correctly

## Related Documentation

- [Environment Variables](./environment-variables.md) - JWT configuration options
- [Custom Remote Caching](./custom-remote-caching.md) - JWT authentication setup
- [JWT Authentication](./jwt-authentication.md) - JWT authentication overview
