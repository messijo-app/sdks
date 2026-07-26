# Bootstrap OpenAPI fixture

`intended-0.1.0.json` is a reviewed copy of the backend-owned intended public
contract. It exists only to bootstrap generation and consumer tests before the
production release receiver establishes a trusted baseline.

This fixture is **not release authority**. It cannot create a trusted receipt,
replace `contracts/current/openapi.json`, enable a publication workflow, or
authorize an npm release.

Review recorded on 2026-07-25:

- OpenAPI version: `3.0.0`
- API version: `0.1.0`
- Stability: `experimental`
- Sole server: `https://api.messijo.com`
- Consumer authentication: `X-API-Key` header via the `x-api-key` security
  scheme
- Representative stable operations: `listKeywords` and `createKeyword`
- Canonical SHA-256:
  `8d96285808432fb739e2cd8be9f41bb111de3ede03898c0ad5678085335744ac`
