# `@messijo/sdk`

Experimental, Fetch-based TypeScript SDK for the Messijo API.

## Install

```sh
npm install @messijo/sdk
```

This package is ESM-only.

## Quick start

```ts
import { createMessijoClient } from '@messijo/sdk';

const messijo = createMessijoClient({
  apiKey: process.env.MESSIJO_API_KEY!,
});

const { data } = await messijo.listKeywords({
  path: { org_id: 'organization-id' },
});
```

The client defaults to `https://api.messijo.com` and sends the API key in the
`X-API-Key` header. Keep API keys out of source control, logs, URLs, and public
browser bundles.

Pass `baseUrl` and `fetch` when testing or supplying an instrumented
standards-compatible Fetch implementation:

```ts
const messijo = createMessijoClient({
  apiKey: process.env.MESSIJO_API_KEY!,
  baseUrl: 'https://api.example.test',
  fetch: instrumentedFetch,
});
```

Named operations and their request and response types are exported from the
package entry point. Consumers do not need generated internal imports.

## Errors

Non-success responses and transport failures throw `MessijoApiError`. Response
errors expose status, response headers, safely parsed response data, and
redacted request method/URL metadata. Transport errors retain the original error
as `cause`.

```ts
import { MessijoApiError } from '@messijo/sdk';

try {
  await messijo.getOrganization({
    path: { org_id: 'organization-id' },
  });
} catch (error) {
  if (error instanceof MessijoApiError) {
    console.error(error.status, error.data);
  } else {
    throw error;
  }
}
```

## Supported environments

Supported environments are Node.js 22 and 24 and browser environments with
Fetch, Headers, AbortController, and Web Streams. The package is ESM-only and
ships declarations tested with TypeScript 6 and 7.

Deno, Bun, CommonJS-only applications, React Native, and legacy browsers are not
currently supported.

## Experimental compatibility

The SDK is pre-1.0. Minor versions may include documented breaking changes, and
SDK versions are independent from API contract versions. Pin a specific version
and review the
[changelog](https://github.com/messijo-app/sdks/blob/main/CHANGELOG.md) before
upgrading.

Each release records the API contract, backend source commit, OpenAPI checksum,
generator version, and SDK commit. Release `0.1.0` was the one-time
authenticated package bootstrap and does not have GitHub OIDC provenance.
Subsequent releases use npm trusted publishing and automatic provenance from the
protected repository workflow.

Development, generation, and release guidance is available in the
[SDK repository](https://github.com/messijo-app/sdks).
