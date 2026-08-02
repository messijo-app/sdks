# npm Publication Bootstrap

`@messijo/sdk` was intentionally not reserved with a placeholder release. npm
created the scoped package from the final reviewed `0.1.0` artifact because
published versions cannot be replaced. This document records that one-time
exception and the controls required for routine publication.

## Confirmed administrative state

As of July 25, 2026:

- npm user `cmgriffing` is an owner of the `messijo` npm organization.
- The npm account uses two-factor authentication for authorization and writes.
- `@messijo/sdk@0.1.0` is public on npm.
- Protected tag `sdk-typescript-v0.1.0` points to SDK commit
  `5e470d914bdcd25192fd1865b5a8cc67a0aedc37`.
- GitHub user `cmgriffing` is the only administrator of
  `messijo-app/sdks` and is the named `npm-production` approver.
- The `npm-production` environment accepts only tags matching
  `sdk-typescript-v*`.
- Repository ruleset `19747318`, **Protect TypeScript SDK release tags**,
  restricts creation and prevents deletion or non-fast-forward updates of
  matching tags. `cmgriffing` is its recorded bootstrap bypass actor.

Self-review remains allowed because there is one repository administrator.
Add another required reviewer and enable prevention of self-review when a
second release maintainer is available.

## Completed one-time `0.1.0` package creation

The following procedure is retained as an audit record. Do not repeat it for
later versions; routine releases use trusted publishing.

1. Approve the `npm-production` release gate.
2. Check out the exact protected tag and run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm check
   pnpm generate:check
   pnpm pack:check
   ```

3. Confirm the authenticated owner and coordinate immediately before publish:

   ```sh
   npm whoami
   npm org ls messijo
   npm view @messijo/sdk
   ```

   Before the first publish, the last command reported that the package was not
   found.

4. Record the SHA-256 digest of
   `artifacts/package/messijo-sdk-0.1.0.tgz`, then publish that exact tarball
   interactively:

   ```sh
   npm publish artifacts/package/messijo-sdk-0.1.0.tgz \
     --access public \
     --provenance=false
   ```

   Complete npm's two-factor-authentication challenge. Do not create or store
   an npm write token in this repository or in GitHub.

5. `npm view @messijo/sdk@0.1.0 version` now returns `0.1.0`. The bootstrap
   release lacks GitHub OIDC provenance and must remain identified as the
   one-time exception in public release metadata.

## Enable trusted publishing immediately afterward

In the npm package settings for `@messijo/sdk`, add a GitHub Actions trusted
publisher with these exact values:

| Field | Value |
| --- | --- |
| Organization or user | `messijo-app` |
| Repository | `sdks` |
| Workflow filename | `publish.yml` |
| Environment | `npm-production` |
| Allowed action | `npm publish` |

After saving the binding, verify the settings and set these GitHub Actions
repository variables:

```text
NPM_TRUSTED_PUBLISHER_CONFIGURED=true
SDK_NPM_PUBLICATION_ENABLED=true
```

In the package's **Publishing access** settings, select **Require two-factor
authentication and disallow tokens** after the trusted publisher is verified.

All releases after `0.1.0` must use `.github/workflows/publish.yml`; do not
repeat the authenticated local bootstrap procedure.
