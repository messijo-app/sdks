import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  validateBumpRecord,
  validateReleaseMetadata,
  validateVersionBump,
} from './lib/publication.mjs';
import { validateReceipt } from './lib/release-processing.mjs';

const [releaseTag, nextVersion, sdkCommit] = process.argv.slice(2);
if (!releaseTag || !nextVersion || !sdkCommit) {
  throw new Error(
    'Usage: node scripts/prepare-sdk-release.mjs <api-release-tag> <sdk-version> <sdk-commit>',
  );
}
if (!/^[0-9a-f]{40}$/u.test(sdkCommit)) {
  throw new Error('sdk-commit must be 40 lowercase hexadecimal characters');
}

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const packagePath = path.join(
  repositoryRoot,
  'packages/typescript/package.json',
);
const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'));
const bump = validateBumpRecord(
  JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'release-bumps', `${releaseTag}.json`),
      'utf8',
    ),
  ),
);
const receipt = validateReceipt(
  JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'contracts/releases', `${releaseTag}.json`),
      'utf8',
    ),
  ),
);
if (
  bump.release_tag !== releaseTag ||
  bump.api_version !== receipt.api_version ||
  bump.spec_sha256 !== receipt.spec_sha256 ||
  bump.backend_source_commit !== receipt.backend_source_commit
) {
  throw new Error('reviewed bump and trusted receipt provenance differ');
}
validateVersionBump({
  changeKind: bump.change_kind,
  currentVersion: packageManifest.version,
  nextVersion,
});

const breakingNotes = (process.env.SDK_BREAKING_NOTES ?? '')
  .split('\n')
  .map((note) => note.trim())
  .filter(Boolean);
if (bump.change_kind === 'breaking' && breakingNotes.length === 0) {
  throw new Error('breaking API releases require prominent SDK breaking notes');
}
const changelogHeading = `## ${nextVersion} - Unreleased`;
const changelogEntry = `${changelogHeading}

> Experimental SDK: compatibility is not guaranteed until 1.0.0.

${breakingNotes.map((note) => `**BREAKING:** ${note}`).join('\n\n') || '- No approved SDK-level breaking changes.'}

- API contract: \`${receipt.api_version}\`
- Backend source: \`${receipt.backend_source_commit}\`
- OpenAPI SHA-256: \`${receipt.spec_sha256}\`
- Generator: \`${bump.generator}\`
- SDK base commit: \`${sdkCommit}\`

`;
const changelogPath = path.join(repositoryRoot, 'CHANGELOG.md');
const existingChangelog = await readFile(changelogPath, 'utf8');
if (existingChangelog.includes(changelogHeading)) {
  throw new Error(`changelog already contains ${changelogHeading}`);
}

packageManifest.version = nextVersion;
await writeFile(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`);
await writeFile(
  changelogPath,
  existingChangelog.replace(
    '# Changelog\n\n',
    `# Changelog\n\n${changelogEntry}`,
  ),
);
const metadata = validateReleaseMetadata({
  api_version: receipt.api_version,
  backend_source_commit: receipt.backend_source_commit,
  breaking_changes: breakingNotes,
  changelog: changelogHeading,
  generator: bump.generator,
  openapi_sha256: receipt.spec_sha256,
  schema_version: 1,
  sdk_commit: sdkCommit,
  sdk_version: nextVersion,
});
const releasesDirectory = path.join(repositoryRoot, 'releases/typescript');
await mkdir(releasesDirectory, { recursive: true });
await writeFile(
  path.join(releasesDirectory, `v${nextVersion}.json`),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
