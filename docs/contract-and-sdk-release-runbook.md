# Contract intake and SDK release runbook

This is the operational source of truth for accepting a verified production API
contract and releasing an SDK. Contract intake happens once; preparation,
versioning, tagging, approval, publication, and recovery happen independently
for each supported language.

## Prerequisites

- Maintainer access to Actions and pull requests in `messijo-app/sdks`.
- For repair, production-environment access to `messijo-app/api` and the exact
  deployed source commit, API version, and original breaking-override status.
- For TypeScript publication, authority to create the protected
  `sdk-typescript-v*` tag and approve `npm-production`.
- A clean local checkout is useful for tag verification, but routine contract
  intake and release preparation run in GitHub Actions.

Never manually replace `contracts/current/openapi.json`, download an unverified
contract into the repository, or manufacture a `repository_dispatch` payload.
Routine intake occurs only through the checksum-verified
`api-contract-released` receiver.

## 1. Automated contract intake

1. Confirm the backend production deployment and live-contract verification
   succeeded. The backend then emits `api-contract-released`.
2. In the SDK repository, open **Process released API contract** and verify the
   selected API tag, checksum, backend source commit, and receiver run.
3. Confirm the workflow validated the event shape, downloaded the live contract,
   matched its checksum and provenance, and opened one `automation/api-v<version>`
   pull request. The receiver does not publish packages.
4. If an exact replay reports no changes, compare it with the existing immutable
   receipt; this is the expected idempotent outcome.

If notification is missing or uncertain, do not synthesize SDK-side input. Run
[Repair API Contract Release Record](https://github.com/messijo-app/api/actions/workflows/repair-api-contract-release.yml)
in `messijo-app/api` with:

- `source_commit`: the successfully deployed backend commit;
- `expected_api_version`: the exact version served by production;
- `breaking_override_used`: the original deployment's override value.

The repair workflow regenerates that source contract, checks it against live
production, creates only missing backend metadata, and safely replays the same
notification. Expected SDK-side evidence is a receiver run with the same API
tag, checksum, source commit, change classification, override status, and either
one matching review pull request or an exact-replay no-op. A live-contract,
checksum, event-shape, or provenance conflict belongs to the backend/receiver
boundary; correct or escalate it there instead of bypassing verification.

## 2. Review the generated contract pull request

Before merging:

1. Match the receipt under `contracts/releases/` to the API release and receiver
   run.
2. Review `contracts/current/openapi.json` and generated diffs; generated files
   must not contain unexplained manual edits.
3. Match each implemented language's bump record under `release-bumps/` to the
   shared receipt and review its recommendation independently.
4. Require CI, generation checks, package checks, and safety scans to pass.
5. Merge the pull request to the current default branch. Merging accepts the
   contract; it publishes no SDK and does not require every language to release.

## 3. Prepare a TypeScript release

Open **Prepare TypeScript SDK release candidate**, enter the reviewed API tag
(for example `api-v0.2.0`), requested SDK version without `v` (for example
`0.3.0`), and approved breaking notes when required. Use GitHub's native branch
selector to choose the candidate branch.

The selector chooses a branch tip, not an arbitrary commit. At dispatch,
`github.ref` records the branch and `github.sha` freezes its then-current tip.
The workflow always checks out that exact SHA, even if the branch moves while
the run is active. The ref name is audit context and is never re-resolved as a
replacement candidate.

The candidate must be a branch ref whose dispatch-time SHA:

- exactly equals the checked-out `git rev-parse HEAD`;
- is an ancestor of the freshly fetched current default branch; and
- contains the requested trusted receipt and TypeScript bump with matching API
  version, checksum, and backend source commit.

The read-only job checks these rules first. Only its dependent preparation job
receives `contents: write` and `pull-requests: write`; that job repeats SHA and
ancestry validation before changing `release/sdk-typescript-v<version>` or its
pull request. Provenance comes from the checked-out `HEAD`.

Candidate failures are fail-before-write:

| Failure | Meaning and safe action |
| --- | --- |
| Selected ref is a tag or malformed | Dispatch again from a branch; API dispatch of a tag is not eligible. |
| Checkout differs from dispatch SHA | Do not continue; inspect checkout/event handling and escalate as a workflow integrity failure. |
| SHA is not on the current default branch | Merge and review the candidate first, then dispatch from an eligible branch. |
| Receipt or language bump is missing | Complete and merge contract intake; never create the record manually to unblock a run. |
| Receipt and bump disagree | Stop and escalate to the contract-intake owner; do not rewrite immutable provenance. |
| Version or breaking notes fail | Correct the preparation input or reviewed language release decision, then retry. |

An older merged branch tip is eligible because its SHA remains in default-branch
history. It deliberately prepares that older snapshot and shows the full SHA in
the run and pull request. Review stale candidates carefully against the current
default branch. To select an older commit, a named branch must point to it when
dispatch occurs; the form does not accept arbitrary SHA text.

The regression matrix is executable in `scripts/release-candidate.test.ts` and
records the expected fail-before-write evidence:

| Fixture | Expected read-only validation result | Write-authorized job |
| --- | --- | --- |
| Current default-branch tip | Eligible | May start |
| Older merged branch tip | Eligible at the original full SHA | May start |
| Unmerged branch tip | Fails ancestry | Never starts |
| Tag dispatch | Fails branch-ref policy | Never starts |
| Branch moves after dispatch | Original dispatch SHA remains eligible if it is merged | Uses original SHA, not moved tip |
| Checkout/SHA mismatch | Fails exact-checkout policy | Never starts |
| Missing receipt or bump | Fails release-input validation | Never starts |
| Inconsistent receipt/bump provenance | Fails release-input validation | Never starts |

## 4. Review the release pull request

1. Verify the selected ref and full candidate SHA in the workflow summary and
   pull request.
2. Confirm the requested version, changelog, breaking notes, API receipt,
   generator, and `sdk_commit` provenance.
3. Confirm only TypeScript release-owned files changed and all gates passed.
4. Merge into the current default branch. Re-running the same preparation while
   its release branch/PR exists updates that one branch and PR; first inspect any
   partial or conflicting state.

## 5. Create the protected TypeScript tag

Tag creation is a reviewed handoff, separate from environment approval and npm
publication.

1. Fetch the current default branch and tags. Identify the exact merged commit
   containing the requested package version, changelog, and
   `releases/typescript/v<version>.json`.
2. Check the package and metadata versions, then verify the target belongs to
   the current default branch:

   ```sh
   git fetch origin main --tags
   release_commit=<full-merged-commit-sha>
   version=<version-without-v>
   test "$(git show "$release_commit:packages/typescript/package.json" | jq -r .version)" = "$version"
   test "$(git show "$release_commit:releases/typescript/v$version.json" | jq -r .sdk_version)" = "$version"
   git merge-base --is-ancestor "$release_commit" origin/main
   ```

3. Confirm `sdk-typescript-v<version>` does not already exist locally, remotely,
   or on npm. Create the annotated tag at that exact commit and push only it:

   ```sh
   tag="sdk-typescript-v$version"
   git tag --annotate "$tag" "$release_commit" --message "Release @messijo/sdk $version"
   git push origin "refs/tags/$tag"
   ```

Repository ruleset `19747318` protects `sdk-typescript-v*` creation, deletion,
and non-fast-forward changes. Never move or reuse a release tag.

## 6. Approve and verify TypeScript publication

The protected tag starts **Publish TypeScript SDK**. Approval of the
`npm-production` environment is a distinct action; that environment accepts only
`sdk-typescript-v*`. The workflow uses the exact `publish.yml` npm trusted
publisher, requests OIDC, publishes with provenance, and stores no npm token.

After approval, verify the workflow's tag/default-branch check, package allowlist,
quality gates, `npm publish`, indexed version, and npm attestations. Confirm
`npm view @messijo/sdk@<version> version` returns the intended immutable version.

Recovery depends on where failure occurred:

- Before `npm publish`: fix the workflow or reviewed source and prepare a new
  release commit/tag as appropriate. Never move the existing protected tag.
- Push outcome uncertain: check the GitHub log and npm registry first. Do not
  retry a possibly successful publish blindly.
- Publish succeeded but indexing is delayed: poll/read the registry; do not
  publish again merely because indexing is slow.
- Published version is defective: npm versions are immutable. Prepare and
  publish a corrective version; do not overwrite it or move its tag.

## Language isolation

One accepted contract may lead to zero, one, or several language releases. A
TypeScript failure does not require replaying intake, rolling back the API, or
changing another language. Likewise, future C# preparation, versioning,
`sdk-csharp-v*` tags, `nuget-production` approval, publication, and recovery are
independent. `nuget-production` exists, but C# preparation and publication
workflows are planned and must not be treated as implemented until they land.

## Workflow catalog

| Status | Workflow | Trigger and prerequisites | Inputs | Authority | Output and success evidence | Safe retry and escalation owner |
| --- | --- | --- | --- | --- | --- | --- |
| Implemented | **Process released API contract** (`api-contract-released.yml`) | Backend `repository_dispatch: api-contract-released` after production checksum verification | Authenticated event payload: API version/tag, contract URL/checksum, backend commit, classification, override | Read-only validation; dependent proposal job gets contents/PR write | Immutable receipt, canonical contract/generated diff, bump record, one review PR or exact replay no-op | Identical replay is safe; backend delivery/production evidence: backend release owner; SDK verification/PR: SDK contract-intake owner |
| Implemented | **Prepare TypeScript SDK release candidate** (`prepare-release.yml`) | Manual dispatch from an eligible branch tip already in current default-branch history after receipt/bump review | API release tag, TypeScript version, optional/required breaking notes; native branch selector supplies ref/SHA | Read-only candidate job; dependent preparation job alone gets contents/PR write | Eligible full SHA/ref summary, `release/sdk-typescript-v<version>`, one release PR with checked-out provenance | Retry after checking branch/PR state; receipt conflicts: contract-intake owner; release policy: TypeScript maintainer |
| Implemented | **Publish TypeScript SDK** (`publish.yml`) | Push of protected `sdk-typescript-v*` on default branch after merged release PR | Tag; repository enablement/trusted-publisher variables | Contents read, OIDC write, `npm-production` approval; no stored npm token | `@messijo/sdk@<version>` plus npm provenance/attestations and registry verification | Before push is rerunnable after correction; uncertain push requires registry check; immutable defects require a new version; owner: TypeScript/npm release maintainer |
| Planned | C# release preparation | Not implemented; future manual eligible-branch dispatch after C# bump/receipt review | Planned API tag, C# version, breaking notes | Must follow read-only validation then narrowly scoped PR write | Planned `release/sdk-csharp-v<version>` and C# release PR | C# maintainer; must update this catalog when implemented |
| Planned | C# NuGet publication | Not implemented; future protected `sdk-csharp-v*` tag | Planned tag and trusted-policy state | Planned contents read, OIDC write, `nuget-production` approval | Planned immutable `Messijo` NuGet package | C# / NuGet release maintainer; must update this catalog when implemented |

For protocol detail, retain the
[cross-repository handoff](sdk-repository-handoff.md). For historical npm setup
and exact trusted-publisher controls, retain the
[npm publication bootstrap record](npm-publication-bootstrap.md).
