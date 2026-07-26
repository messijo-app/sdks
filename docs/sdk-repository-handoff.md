# Public SDK Repository Handoff

## Purpose

This document transfers the decisions and constraints needed to design Messijo's public SDK repository. It is intended for an engineer or an `openspec-explore` session entering that repository without access to the private backend implementation.

After reading this document, the reader should be able to create a repository-local OpenSpec proposal for generating, testing, versioning, and publishing the Messijo SDKs.

The SDK repository does not exist yet. The backend release workflow implements the notification contract below, but dispatch remains a visible successful skip until the SDK repository and GitHub App configuration exist.

The backend implementation is ready for SDK repository design, but the new
production baseline has not been established yet. A live check on July 23,
2026 found that the production specification still advertises legacy version
`1.0`, has no stability marker, and contains a localhost server. It must not be
used to generate or publish the new SDK.

Contract `0.1.0` will be the initial experimental baseline after the protected
bootstrap deploys it and verifies the live checksum. Until then, the SDK
repository may establish its structure, tests, receiver, and generator using a
reviewed copy of the intended public contract as a non-publishable fixture.
Publication must remain disabled until the event-driven workflow downloads and
verifies the deployed production contract.

## Settled Decisions

- The SDKs will be generated from Messijo's public OpenAPI document.
- TypeScript will be the first and only language in the initial milestone.
- TypeScript generation will use [Hey API](https://heyapi.dev/docs/openapi/typescript/get-started).
- Later SDKs will use [Microsoft Kiota](https://learn.microsoft.com/en-us/openapi/kiota/):
  - C#
  - Go
  - Java
  - PHP
  - Python
- The API and its SDKs will begin as experimental `0.x` releases.
- API contract versions and SDK package versions are independent.
- The private backend repository owns the API contract and compatibility policy.
- The public SDK repository owns generation, SDK usability, package versioning, and registry publication.
- SDK generators and their runtime dependencies must be pinned and upgraded deliberately.

Java should be introduced after the stable Kiota targets or published explicitly as preview if Kiota still classifies Java support as preview when that work begins. Language maturity must be checked again before each SDK is proposed.

## Ownership Boundary

The private backend repository is responsible for:

- Producing a deterministic public OpenAPI document.
- Ensuring the document contains only public operations and schemas.
- Providing stable, consumer-facing operation identifiers and tags.
- Describing the production server and supported authentication schemes accurately.
- Assigning an API contract version and stability level.
- Validating the document and detecting stale generated output.
- Detecting backward-incompatible contract changes.
- Blocking automatic production deployments when a breaking change is detected.
- Providing an audited manual override while the API is experimental.
- Recording successful API releases and their contract checksums.
- Notifying the public SDK repository after a successful production deployment.

The public SDK repository is responsible for:

- Owning all generator configuration.
- Generating and committing SDK source when appropriate for the selected workflow.
- Adding ergonomic authentication setup around generated clients.
- Compiling, linting, and testing each supported SDK.
- Running consumer-level smoke tests.
- Selecting SDK package versions.
- Publishing packages to their language registries.
- Producing SDK changelogs and prereleases.
- Recording which API contract and generator produced every release.

The SDK repository must not become responsible for deploying the API, deciding whether an HTTP contract change is permitted, or reconstructing the public specification from backend source code.

## Backend Integration Contract

After a successful production deployment, release recording, and verification
of the deployed specification checksum, the backend notifies the SDK repository
with GitHub's `repository_dispatch` API. The event type and payload are exact;
adding, removing, or changing a field is a cross-repository contract change.

The complete dispatch request body is:

```json
{
  "event_type": "api-contract-released",
  "client_payload": {
    "api_version": "0.1.0",
    "stability": "experimental",
    "source_commit": "<40 lowercase hexadecimal characters>",
    "spec_sha256": "<64 lowercase hexadecimal characters>",
    "spec_url": "https://api.messijo.com/openapi.json",
    "release_tag": "api-v0.1.0",
    "change_kind": "additive",
    "breaking_override_used": false
  }
}
```

The receiving workflow reads these fields from
`github.event.client_payload`. It should reject unknown `client_payload` fields
and enforce these field constraints before downloading or generating anything:

| Field | Constraint |
| --- | --- |
| `api_version` | Valid semantic version; initially exactly `0.1.0` |
| `stability` | Exactly `experimental` for the initial milestone |
| `source_commit` | Exactly 40 lowercase hexadecimal characters |
| `spec_sha256` | Exactly 64 lowercase hexadecimal characters |
| `spec_url` | Exactly `https://api.messijo.com/openapi.json` |
| `release_tag` | Exactly `api-v<api_version>` |
| `change_kind` | `additive`, `corrective`, or `breaking` |
| `breaking_override_used` | JSON boolean, not a string |

`change_kind` means:

- `additive`: the public contract gained compatible functionality.
- `corrective`: the contract changed without adding functionality or intentionally breaking consumers.
- `breaking`: the release contains an approved backward-incompatible change.

When `breaking_override_used` is true, `change_kind` must be `breaking`, the
contract must still be experimental, and its major version must be zero.

The receiver must be merged into the SDK repository's default branch before
notification is enabled. [GitHub only triggers a `repository_dispatch`
workflow when its workflow file exists on the default
branch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch).
A minimal trigger is:

```yaml
name: Process released API contract

on:
  repository_dispatch:
    types: [api-contract-released]

permissions:
  contents: read
```

The notification is a signal, not the source of the specification. The SDK workflow should:

1. Validate the exact event shape, cross-field invariants, and expected production URL.
2. Download the OpenAPI document from `spec_url`.
3. Parse it as JSON and confirm that `info.version` equals `api_version`,
   `info.x-stability` equals `stability`, and its server is the expected
   production API.
4. Normalize the JSON with recursively sorted object keys, compact separators,
   and one trailing line feed. The backend currently computes the checksum with:

   ```sh
   jq --sort-keys --compact-output . openapi.json | sha256sum
   ```

   On macOS, `shasum -a 256` is equivalent to `sha256sum` in this pipeline.
   Hashing the downloaded bytes directly will not match.
5. Continue only when the lowercase checksum matches `spec_sha256`.
6. Treat `api_version` and `source_commit` as provenance, not as the SDK package version.
7. Exit successfully without generating or publishing again if the same release tag and checksum were already processed.

The workflow should retry downloads that return a stale checksum for a bounded period. A persistent mismatch must fail visibly rather than generating from an unverified document.

The OpenAPI document is too large to embed safely in a dispatch payload. If fetching the deployed document proves unreliable, the repositories should adopt a versioned public artifact location rather than passing compressed specification contents through the event.

## Delivery, Replay, and Ordering

The backend sends the event after the API is already live. SDK generation or
publication failure cannot roll back the API release.

Delivery is intentionally retryable. If notification fails or its outcome is
uncertain, an operator can run the backend repair workflow. Repair verifies the
live production checksum and emits the same release tag, checksum, provenance,
classification, and override values without redeploying the API.

The current repair workflow is intended for the initial `0.1.0` baseline or the
latest API release. Do not use it to backfill an older non-initial notification
after newer API release tags exist; reconstructing that older compatibility
classification is not yet supported. Coordinate such a backfill with the
backend maintainers instead of manufacturing an SDK event.

The SDK repository should persist a release receipt keyed by `release_tag` and
`spec_sha256`:

- An identical replay is a successful no-op.
- A previously seen release tag with a different checksum or source commit is a
  hard provenance conflict and must fail visibly.
- A checksum must never be accepted merely because it appeared in an earlier
  untrusted pull request or workflow artifact.
- A replay of the initial `0.1.0` baseline can arrive after newer releases, so
  the workflow must not assume delivery order. It should record an already
  processed older release without republishing or replacing a newer SDK.

## Enabling the First Dispatch

Use this sequence when the SDK repository is ready:

1. Merge the validated receiving workflow into the SDK repository's default
   branch.
2. Create or reuse a GitHub App installed only on that repository. Grant it
   repository **Contents: write**, which [GitHub requires for creating a
   repository dispatch
   event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event).
3. Configure all four backend production values:
   `SDK_REPOSITORY_OWNER`, `SDK_REPOSITORY_NAME`, `SDK_GITHUB_APP_ID`, and
   `SDK_GITHUB_APP_PRIVATE_KEY`. Partial configuration fails; all four absent is
   a successful skip.
4. If the backend has not established `api-v0.1.0`, run the protected initial
   baseline bootstrap. Its event is `additive` with
   `breaking_override_used: false`.
5. If `api-v0.1.0` already exists because production was bootstrapped while SDK
   notification was disabled, run the backend release-repair workflow with the
   deployed source commit, API version `0.1.0`, and override status `false`.
   Repair replays the verified event without redeploying.
6. Confirm that the SDK workflow recorded the exact tag, checksum, API version,
   and backend source commit before enabling package publication.

Do not consider onboarding complete until a fresh production download has all
of these properties:

- `info.version` is `0.1.0`.
- `info.x-stability` is `experimental`.
- The only server URL is `https://api.messijo.com`.
- Its normalized checksum matches the received `spec_sha256`.
- The corresponding immutable release tag is `api-v0.1.0`.

## Experimental API Lifecycle

The initial public API remains on unversioned `/api/...` routes while its contract version and SDK packages use `0.x` semantic versions.

Experimental means that breaking changes remain possible, not that they are invisible:

- Pull requests should report contract changes.
- Automatic production deployment should still stop on a detected breaking change.
- A breaking experimental release may proceed through an explicit, reviewed override.
- The override must include a contract version bump and an auditable justification.
- SDK release notes must call out approved breaking changes prominently.

During this phase, generating an SDK after the corresponding API reaches production is acceptable. The package should be clearly labeled experimental and should not imply long-term compatibility for the unversioned API surface.

## Stable API Lifecycle

When Messijo commits to a stable API generation, the expected transition is:

1. Introduce versioned `/api/v1/...` routes.
2. Release API contract `1.0.0`.
3. Make stable SDKs default to `/api/v1`.
4. Keep unversioned routes temporarily as a deprecated migration alias.
5. Stop adding new functionality to the unversioned surface.
6. Retire the alias after a documented migration window.

A later breaking generation should introduce `/api/v2` while `/api/v1` remains available during migration. Before stable versioned APIs are designed, the repositories will need a coordinated release-candidate protocol that can prepare and validate new SDKs before the production API changes. That protocol is intentionally outside the initial TypeScript milestone.

## Initial TypeScript Milestone

The first SDK proposal should cover only TypeScript and should prove that the cross-repository system works end to end.

The generated package should provide:

- Types generated from the verified OpenAPI document.
- A Fetch-based client unless exploration identifies a concrete consumer constraint requiring another Hey API client.
- A straightforward way to configure the production base URL.
- A straightforward way to supply a Messijo API key.
- Errors that preserve useful HTTP status and response information.
- Package metadata identifying the source API contract version and commit.

The milestone should include:

- An exact pinned Hey API version.
- Deterministic generation with a clean-worktree check.
- Type checking, linting, package build, and package-content inspection.
- Tests for authentication configuration and representative request construction.
- A consumer smoke test that installs the packed artifact rather than importing source files directly.
- An experimental npm prerelease or `0.x` release process.
- Idempotent handling of repeated backend release events.
- Failure reporting that makes a broken generation or publication actionable.

The initial milestone succeeds when a fresh consumer project can install the packed TypeScript SDK, configure an API key, construct representative list and create requests, and handle a documented error without referring to generated internals.

Live requests against production are not required for every pull request. If live smoke tests are added, they must use a dedicated account, least-privilege credentials, and operations that cannot mutate customer data.

## Kiota Expansion

The other SDKs should be separate follow-up milestones after the TypeScript pipeline is reliable. A reasonable order is:

1. C#
2. Go
3. Python
4. PHP
5. Java

The exact order may change based on customer demand. Each language must independently prove:

- Reproducible generation from the same verified OpenAPI contract.
- Appropriate Kiota runtime dependency versions.
- Idiomatic package naming and namespace choices.
- API-key authentication ergonomics.
- Compilation and language-native tests.
- Installation from a locally packed package.
- Publication to the language's standard registry.

Kiota generation configuration and its lock file should be committed. Kiota upgrades should be reviewed as SDK source changes and released according to their effect on consumers.

Expected package ecosystems are:

| Language | Generator | Registry or distribution mechanism |
| --- | --- | --- |
| TypeScript | Hey API | npm |
| C# | Kiota | NuGet |
| Go | Kiota | Versioned Go module tags |
| Java | Kiota | Maven Central or another selected Maven repository |
| PHP | Kiota | Packagist |
| Python | Kiota | PyPI |

Registry ownership, package coordinates, signing, trusted publishing, and required organization setup remain decisions for the SDK repository.

## Versioning and Provenance

API and SDK versions must not be forced into lockstep. For example, API contract `0.4.0` may be consumed by TypeScript SDK `0.7.1`.

Every SDK release should record:

- SDK package version.
- API contract version.
- Backend source commit.
- OpenAPI checksum.
- Generator name and exact version.
- SDK repository commit.

This separation permits SDK-only fixes and generator upgrades without manufacturing a backend API release.

The SDK repository should define how contract changes influence suggested SDK bumps. It should not assume that the backend's `change_kind` captures every source-level SDK break: operation naming, generator behavior, convenience wrappers, and runtime dependency changes can affect SDK compatibility without changing HTTP compatibility.

## Security and Publication Constraints

The SDK repository and all of its workflow logs are public. Its workflows must assume that pull-request authors and readers can inspect generated output and CI behavior.

- Only the intentionally public OpenAPI document may cross the private repository boundary.
- Generated output must be checked for private URLs, internal routes, secrets, realistic credentials, and implementation-only descriptions or examples.
- Cross-repository credentials should come from a narrowly scoped GitHub App rather than a personal token.
- The backend should need only enough access to dispatch the release event; package publication credentials belong to the SDK repository.
- Public pull-request workflows must not expose publication credentials to untrusted code.
- Third-party actions and generators should be pinned deliberately.
- Registry publication should use short-lived or trusted-publishing credentials where supported.
- Releases should include provenance or attestations where the selected registry supports them.

## Decisions for SDK Repository Exploration

The following questions are intentionally left for exploration in the public repository:

1. Should all languages live in one repository or should each language eventually have its own repository?
2. What are the public repository name, package names, namespaces, and registry coordinates?
3. Should generated source be committed, or generated only for package builds?
4. How much handwritten convenience API should wrap generated clients?
5. How should SDK versions be proposed and approved?
6. Should backend release events open generated pull requests or publish automatically after SDK tests pass?
7. Which package-signing, provenance, and trusted-publishing mechanisms are available for each registry?
8. How should failed SDK generation be reported back to backend maintainers?
9. Which consumer environments and runtime versions are supported by the TypeScript package?
10. When should the first Kiota language be introduced, and which language has the strongest actual demand?

These decisions should be made in the SDK repository because they govern its public developer experience and release operations. They must not be silently decided by the private backend workflow.

## Initial SDK Proposal Acceptance Criteria

The OpenSpec proposal created from this handoff should be considered complete enough to implement when it:

- Covers TypeScript only and explicitly defers Kiota SDK implementation.
- Defines the public repository and npm package identity.
- Documents supported TypeScript and runtime versions.
- Defines the exact event-processing and checksum-validation behavior.
- Requires the receiving workflow to exist on the default branch before
  backend notification is enabled.
- Defines the Hey API configuration and generated-versus-handwritten boundary.
- Defines API-key setup from a consumer's perspective.
- Defines deterministic generation and consumer smoke tests.
- Defines experimental versioning and npm publication behavior.
- Defines idempotency receipts, provenance-conflict handling, bounded retry,
  out-of-order event behavior, and observable failures.
- Identifies every backend guarantee on which implementation is blocked.
- Leaves no publication credential or cross-repository permission ambiguous.

## Suggested Opening Prompt

The following prompt can be supplied with this document to a new `openspec-explore` session in the public repository:

> Design the initial public Messijo TypeScript SDK repository using this handoff as its backend contract. Explore the repository structure, Hey API configuration, generated-versus-handwritten boundaries, API-key ergonomics, tests, experimental versioning, npm publication, and handling of the `api-contract-released` event. Identify any missing backend guarantees instead of inventing them. Keep C#, Go, Java, PHP, and Python as future Kiota milestones, not part of the initial implementation proposal.

