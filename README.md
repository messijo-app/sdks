# Messijo SDKs

Official SDKs for the [Messijo API](https://api.messijo.com).

The first supported package is the experimental, Fetch-based TypeScript SDK:

```sh
npm install @messijo/sdk
```

> [!WARNING] The SDK is pre-1.0. Minor releases may contain breaking changes
> while the public API is experimental. Pin a specific version and review the
> [changelog](CHANGELOG.md) before upgrading.

## TypeScript quick start

```ts
import { createMessijoClient } from '@messijo/sdk';

const messijo = createMessijoClient({
  apiKey: process.env.MESSIJO_API_KEY!,
});

const { data } = await messijo.listKeywords({
  path: { org_id: 'organization-id' },
});

console.log(data);
```

`createMessijoClient` defaults to `https://api.messijo.com` and attaches the API
key as the `X-API-Key` request header. Keep API keys out of source control,
logs, URLs, and public browser bundles.

For tests, alternate deployments, or instrumented networking, provide a base URL
or Fetch implementation:

```ts
const messijo = createMessijoClient({
  apiKey: process.env.MESSIJO_API_KEY!,
  baseUrl: 'https://api.example.test',
  fetch: instrumentedFetch,
});
```

The client exposes named operations such as `listKeywords`, `createKeyword`,
`listNotifications`, and `getOrganization`. Request and response types are
exported from the package entry point, so consumers do not need generated
internal imports.

## Error handling

HTTP and transport failures throw `MessijoApiError`:

```ts
import { MessijoApiError } from '@messijo/sdk';

try {
  await messijo.getOrganization({
    path: { org_id: 'organization-id' },
  });
} catch (error) {
  if (error instanceof MessijoApiError) {
    console.error(error.status, error.data);
    console.error(error.request.method, error.request.url);
  } else {
    throw error;
  }
}
```

For an HTTP failure, the error preserves the status, response headers, safely
parsed response data, and redacted request method and URL. For a transport
failure, `status` is undefined and the original failure is available as `cause`.
API keys are not included in request metadata.

## Compatibility

| Environment   | Support                                                          |
| ------------- | ---------------------------------------------------------------- |
| Node.js       | 22 and 24                                                        |
| TypeScript    | 6 and 7                                                          |
| Browsers      | Standards-based Fetch, Headers, AbortController, and Web Streams |
| Module format | ESM only                                                         |

Deno, Bun, CommonJS-only applications, React Native, and legacy browsers are not
currently supported.

## Versioning and provenance

SDK versions use SemVer independently from API contract versions. While the SDK
is experimental, releases remain on `0.x`; a minor version may include a
documented breaking change.

Every release records the API version, backend source commit, normalized OpenAPI
checksum, generator version, and SDK commit. `0.1.0` was the one-time
authenticated package bootstrap and therefore does not have GitHub OIDC
provenance. Later releases are published from the protected GitHub Actions
workflow using npm trusted publishing and automatic provenance.

## Contributing

Development uses Node.js 24 and the pnpm version pinned by the repository:

```sh
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm check
pnpm generate:check
pnpm pack:check
```

Generated source is committed for review and must not be edited by hand. Routine
generation reads `contracts/current/openapi.json`, the reviewed canonical
contract in the checked-out revision, and uses the exactly pinned generator.
Isolated tests may explicitly set `MESSIJO_OPENAPI_INPUT` to a repository-local
fixture; URI inputs and paths outside this repository are rejected.
`pnpm generate:check` deletes and regenerates the generated tree, then compares
it with the committed output of the same revision. It fails for stale, missing,
or newly generated files but ignores unrelated repository changes.
`pnpm pack:check` inspects the actual tarball and installs it into a temporary
consumer project.

## Release and repair flow

1. The backend emits an authenticated release event only after production
   deployment and live contract checksum verification.
2. The receiver validates the event, downloads the production contract, records
   an immutable receipt, regenerates the SDK, and opens a review pull request.
3. A maintainer reviews and merges the generated change, then runs the release
   preparation workflow to create a version, changelog, and provenance pull
   request.
4. After that pull request merges, a protected `sdk-typescript-v<version>` tag
   starts publication. The `npm-production` environment requires approval, and
   npm accepts the publish through the repository's exact OIDC trusted-publisher
   binding.

Receiver and publication failures are reported in GitHub Actions job summaries
with non-secret diagnostics and a recovery action. Replaying an identical
backend event is safe. If delivery is missing or uncertain, use the backend's
release-repair workflow; do not manufacture a dispatch payload. A version
already accepted by npm is immutable and must be corrected with a new version.

Maintainers can consult the [repository handoff](docs/sdk-repository-handoff.md)
for the cross-repository contract and the
[npm publication runbook](docs/npm-publication-bootstrap.md) for registry
controls.
