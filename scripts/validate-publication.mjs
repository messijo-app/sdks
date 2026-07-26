import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validatePublicationContext } from './lib/publication.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const packageManifest = JSON.parse(
  await readFile(
    path.join(repositoryRoot, 'packages/typescript/package.json'),
    'utf8',
  ),
);
const tag = process.env.GITHUB_REF_NAME ?? '';
const changelogText = await readFile(
  path.join(repositoryRoot, 'CHANGELOG.md'),
  'utf8',
);
const metadata = JSON.parse(
  await readFile(
    path.join(
      repositoryRoot,
      'releases/typescript',
      `v${packageManifest.version}.json`,
    ),
    'utf8',
  ),
);
validatePublicationContext({
  changelogText,
  eventName: process.env.GITHUB_EVENT_NAME,
  fixture: false,
  metadata,
  packageAllowlistPassed: process.env.PACKAGE_ALLOWLIST_PASSED === 'true',
  packageVersion: packageManifest.version,
  publicationEnabled: process.env.SDK_NPM_PUBLICATION_ENABLED === 'true',
  refProtected: process.env.GITHUB_REF_PROTECTED === 'true',
  tag,
  tagOnDefaultBranch: process.env.TAG_ON_DEFAULT_BRANCH === 'true',
  trustedPublisherConfigured:
    process.env.NPM_TRUSTED_PUBLISHER_CONFIGURED === 'true',
});
