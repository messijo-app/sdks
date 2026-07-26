# `@messijo/sdk`

Experimental, Fetch-based TypeScript SDK for the Messijo API.

```ts
import { createMessijoClient } from '@messijo/sdk';

const messijo = createMessijoClient({
  apiKey: process.env.MESSIJO_API_KEY!,
});

const { data } = await messijo.listKeywords({
  path: { org_id: 'organization-id' },
});
```

The client defaults to `https://api.messijo.com`. Pass `baseUrl` and `fetch`
when testing or when supplying an instrumented standards-compatible Fetch
implementation.

Non-success responses and transport failures throw `MessijoApiError`. Response
errors expose status, response headers, safely parsed response data, and
redacted request method/URL metadata. Transport errors retain the original error
as `cause`.

Supported environments are Node.js 22 and 24 and browser environments with
Fetch, Headers, AbortController, and Web Streams. The package is ESM-only and
ships declarations tested with TypeScript 6 and 7.
