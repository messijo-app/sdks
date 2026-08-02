# Generated source ownership

Everything under `src/generated/` is owned by `@hey-api/openapi-ts@0.99.0`. Each
generated TypeScript file carries the generator's auto-generated marker.

Do not hand edit generated files. Change the reviewed OpenAPI input or
`openapi-ts.config.ts`, then run:

```sh
pnpm generate
```

Routine generation uses the reviewed canonical contract at
`contracts/current/openapi.json`. Isolated tests may explicitly set
`MESSIJO_OPENAPI_INPUT` to a repository-local fixture, but the fixture is not a
routine or release input. URI inputs and paths outside the repository are
rejected.

CI runs `pnpm generate:check`, which deletes this directory, regenerates it
using the isolated pinned toolchain, formats it, and compares it with the
committed generated output of the same revision. It fails if tracked output is
stale or missing, or if regeneration creates an untracked file; unrelated
repository changes are outside the comparison.

Handwritten exports, authentication setup, defaults, and error adaptation live
outside `src/generated/`.
