# Generated source ownership

Everything under `src/generated/` is owned by `@hey-api/openapi-ts@0.99.0`. Each
generated TypeScript file carries the generator's auto-generated marker.

Do not hand edit generated files. Change the reviewed OpenAPI input or
`openapi-ts.config.ts`, then run:

```sh
pnpm generate
```

CI runs `pnpm generate:check`, which deletes this directory, regenerates it
using the isolated pinned toolchain, formats it, and fails if the tracked result
changes.

Handwritten exports, authentication setup, defaults, and error adaptation live
outside `src/generated/`.
