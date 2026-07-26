import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  validateBumpRecord,
  validatePublicationContext,
  validateReleaseMetadata,
  validateVersionBump,
} from './lib/publication.mjs';

const metadata = {
  api_version: '0.1.0',
  backend_source_commit: 'a'.repeat(40),
  breaking_changes: [],
  changelog: '## 0.1.0 - Unreleased',
  generator: '@hey-api/openapi-ts@0.99.0',
  openapi_sha256: 'b'.repeat(64),
  schema_version: 1,
  sdk_commit: 'c'.repeat(40),
  sdk_version: '0.1.0',
};
const validContext = {
  changelogText: '# Changelog\n\n## 0.1.0 - Unreleased\n',
  eventName: 'push',
  fixture: false,
  metadata,
  packageAllowlistPassed: true,
  packageVersion: '0.1.0',
  publicationEnabled: true,
  refProtected: true,
  tag: 'sdk-typescript-v0.1.0',
  tagOnDefaultBranch: true,
  trustedPublisherConfigured: true,
};

describe('release preparation validation', () => {
  it('validates reviewed bump and complete release provenance', () => {
    expect(
      validateBumpRecord({
        api_version: '0.1.0',
        backend_source_commit: 'a'.repeat(40),
        change_kind: 'additive',
        generator: '@hey-api/openapi-ts@0.99.0',
        recommendation: 'minor',
        release_tag: 'api-v0.1.0',
        schema_version: 1,
        spec_sha256: 'b'.repeat(64),
      }),
    ).toBeDefined();
    expect(validateReleaseMetadata(metadata)).toEqual(metadata);
    expect(
      validateVersionBump({
        changeKind: 'additive',
        currentVersion: '0.0.0',
        nextVersion: '0.1.0',
      }),
    ).toBe('0.1.0');
  });

  it('keeps experimental versions on 0.x and enforces recommendations', () => {
    expect(() =>
      validateVersionBump({
        changeKind: 'additive',
        currentVersion: '0.1.0',
        nextVersion: '0.1.1',
      }),
    ).toThrow('minor SDK bump');
    expect(() =>
      validateVersionBump({
        changeKind: 'corrective',
        currentVersion: '0.9.0',
        nextVersion: '1.0.0',
      }),
    ).toThrow('remaining on 0.x');
  });
});

describe('fail-closed publication policy', () => {
  it('accepts only the complete protected tag context', () => {
    expect(validatePublicationContext(validContext)).toEqual(metadata);
  });

  it.each([
    ['pull request', { eventName: 'pull_request' }],
    ['repository dispatch', { eventName: 'repository_dispatch' }],
    ['fixture', { fixture: true }],
    ['unprotected tag', { refProtected: false }],
    ['tag off default branch', { tagOnDefaultBranch: false }],
    ['mismatched tag', { tag: 'sdk-typescript-v0.2.0' }],
    ['unexpected package content', { packageAllowlistPassed: false }],
    ['disabled publication', { publicationEnabled: false }],
    ['absent trusted publisher', { trustedPublisherConfigured: false }],
  ])('rejects %s', (_name, override) => {
    expect(() =>
      validatePublicationContext({
        ...validContext,
        ...override,
      }),
    ).toThrow();
  });

  it('rejects missing metadata and unannounced breaking changes', () => {
    expect(() =>
      validatePublicationContext({
        ...validContext,
        metadata: { ...metadata, sdk_commit: undefined },
      }),
    ).toThrow();
    expect(() =>
      validatePublicationContext({
        ...validContext,
        metadata: {
          ...metadata,
          breaking_changes: ['renamed operation'],
        },
      }),
    ).toThrow('prominent');
  });
});

describe('release workflow policy', () => {
  it('keeps publication disabled, tag-only, OIDC-only, and verified', async () => {
    const workflow = await readFile(
      path.resolve(import.meta.dirname, '../.github/workflows/publish.yml'),
      'utf8',
    );
    expect(workflow).toContain('tags:');
    expect(workflow).not.toContain('workflow_dispatch');
    expect(workflow).not.toContain('repository_dispatch');
    expect(workflow).toContain(
      "if: vars.SDK_NPM_PUBLICATION_ENABLED == 'true'",
    );
    expect(workflow).toContain('environment: npm-production');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm@11.13.0');
    expect(workflow).toContain('npm publish --access public --provenance');
    expect(workflow).toContain('dist.attestations');
    expect(workflow).not.toContain('NPM_TOKEN');
    expect(workflow).not.toContain('NODE_AUTH_TOKEN');
  });

  it('prepares releases through a reviewed pull request', async () => {
    const workflow = await readFile(
      path.resolve(
        import.meta.dirname,
        '../.github/workflows/prepare-release.yml',
      ),
      'utf8',
    );
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('node scripts/prepare-sdk-release.mjs');
    expect(workflow).toContain('gh pr create');
  });
});
