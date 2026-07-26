# npm Publication Bootstrap

`@messijo/sdk` is intentionally not reserved with a placeholder release. npm
creates a scoped package on its first public publish, and published versions
cannot be replaced. The first publish must therefore be the final reviewed
`0.1.0` artifact.

## Confirmed administrative state

As of July 25, 2026:

- npm user `cmgriffing` is an owner of the `messijo` npm organization.
- The npm account uses two-factor authentication for authorization and writes.
- `@messijo/sdk` is unclaimed.
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

## One-time `0.1.0` package creation

Do not run these steps until the verified production contract receipt and
generated SDK change have merged, the release-preparation change has set the
package version to `0.1.0`, and the protected
`sdk-typescript-v0.1.0` tag points to the default branch.

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

   The last command must report that the package is not found. If it resolves,
   stop and inspect the package owner and contents.

4. Record the SHA-256 digest of
   `artifacts/package/messijo-sdk-0.1.0.tgz`, then publish that exact tarball
   interactively:

   ```sh
   npm publish artifacts/package/messijo-sdk-0.1.0.tgz --access public
   ```

   Complete npm's two-factor-authentication challenge. Do not create or store
   an npm write token in this repository or in GitHub.

5. Confirm `npm view @messijo/sdk@0.1.0 version` returns `0.1.0`. Record the
   protected tag, SDK commit, tarball digest, registry URL, and the fact that
   this bootstrap release lacks GitHub OIDC provenance in the GitHub release
   notes.

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
