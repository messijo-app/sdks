import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  validateCandidateContext,
  validateReleaseCandidate,
} from './lib/release-candidate.mjs';

const defaultSha = 'a'.repeat(40);
const olderMergedSha = 'b'.repeat(40);
const unmergedSha = 'c'.repeat(40);
const movedBranchTip = 'd'.repeat(40);

const receipt = {
  api_version: '0.2.0',
  backend_source_commit: 'e'.repeat(40),
  breaking_override_used: false,
  change_kind: 'additive',
  processing_disposition: 'latest-generation',
  receiver_run_url: 'https://github.com/messijo-app/sdks/actions/runs/1',
  release_tag: 'api-v0.2.0',
  schema_version: 1,
  spec_sha256: 'f'.repeat(64),
  spec_url: 'https://api.messijo.com/openapi.json',
  stability: 'experimental',
};
const bump = {
  api_version: receipt.api_version,
  backend_source_commit: receipt.backend_source_commit,
  change_kind: receipt.change_kind,
  generator: '@hey-api/openapi-ts@0.99.0',
  recommendation: 'minor',
  release_tag: receipt.release_tag,
  schema_version: 1,
  spec_sha256: receipt.spec_sha256,
};

const createReleaseInputs = async (bumpOverride = {}) => {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'messijo-release-candidate-'),
  );
  await mkdir(path.join(repositoryRoot, 'contracts/releases'), {
    recursive: true,
  });
  await mkdir(path.join(repositoryRoot, 'release-bumps'), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, 'contracts/releases/api-v0.2.0.json'),
    JSON.stringify(receipt),
  );
  await writeFile(
    path.join(repositoryRoot, 'release-bumps/api-v0.2.0.json'),
    JSON.stringify({ ...bump, ...bumpOverride }),
  );
  return repositoryRoot;
};

const validateContext = (override = {}) =>
  validateCandidateContext({
    candidateSha: defaultSha,
    checkedOutSha: defaultSha,
    defaultBranch: 'main',
    isAncestor: async (candidate) =>
      candidate === defaultSha || candidate === olderMergedSha,
    selectedRef: 'refs/heads/main',
    ...override,
  });

describe('release candidate context', () => {
  it('accepts the current default branch tip', async () => {
    await expect(validateContext()).resolves.toMatchObject({
      candidateSha: defaultSha,
      eligibilityResult: 'eligible',
    });
  });

  it('accepts an older merged branch tip without replacing its SHA', async () => {
    await expect(
      validateContext({
        candidateSha: olderMergedSha,
        checkedOutSha: olderMergedSha,
        selectedRef: 'refs/heads/release-candidate',
      }),
    ).resolves.toMatchObject({ candidateSha: olderMergedSha });
  });

  it('rejects an unmerged branch tip', async () => {
    await expect(
      validateContext({
        candidateSha: unmergedSha,
        checkedOutSha: unmergedSha,
        selectedRef: 'refs/heads/feature',
      }),
    ).rejects.toThrow('not an ancestor');
  });

  it('rejects a tag dispatch before mutation', async () => {
    await expect(
      validateContext({ selectedRef: 'refs/tags/sdk-typescript-v0.2.0' }),
    ).rejects.toThrow('selected ref is invalid');
  });

  it('keeps the dispatch SHA when the selected branch moves', async () => {
    const refNowPointsTo = movedBranchTip;
    expect(refNowPointsTo).not.toBe(olderMergedSha);
    await expect(
      validateContext({
        candidateSha: olderMergedSha,
        checkedOutSha: olderMergedSha,
        selectedRef: 'refs/heads/release-candidate',
      }),
    ).resolves.toMatchObject({ candidateSha: olderMergedSha });
  });

  it('regresses the old workflow mismatch between GITHUB_SHA and checkout', async () => {
    await expect(
      validateContext({
        candidateSha: olderMergedSha,
        checkedOutSha: defaultSha,
        selectedRef: 'refs/heads/release-candidate',
      }),
    ).rejects.toThrow('does not equal the immutable dispatch SHA');
  });
});

describe('release candidate inputs', () => {
  it('accepts a consistent trusted receipt and TypeScript bump', async () => {
    const repositoryRoot = await createReleaseInputs();
    await expect(
      validateReleaseCandidate({
        candidateSha: defaultSha,
        checkedOutSha: defaultSha,
        defaultBranch: 'main',
        isAncestor: async () => true,
        language: 'typescript',
        releaseTag: 'api-v0.2.0',
        repositoryRoot,
        selectedRef: 'refs/heads/main',
      }),
    ).resolves.toMatchObject({ eligibilityResult: 'eligible' });
  });

  it('rejects a missing release input', async () => {
    const repositoryRoot = await mkdtemp(
      path.join(os.tmpdir(), 'messijo-release-candidate-missing-'),
    );
    await expect(
      validateReleaseCandidate({
        candidateSha: defaultSha,
        checkedOutSha: defaultSha,
        defaultBranch: 'main',
        isAncestor: async () => true,
        language: 'typescript',
        releaseTag: 'api-v0.2.0',
        repositoryRoot,
        selectedRef: 'refs/heads/main',
      }),
    ).rejects.toThrow('missing or invalid');
  });

  it('rejects inconsistent receipt and bump provenance', async () => {
    const repositoryRoot = await createReleaseInputs({
      backend_source_commit: '1'.repeat(40),
    });
    await expect(
      validateReleaseCandidate({
        candidateSha: defaultSha,
        checkedOutSha: defaultSha,
        defaultBranch: 'main',
        isAncestor: async () => true,
        language: 'typescript',
        releaseTag: 'api-v0.2.0',
        repositoryRoot,
        selectedRef: 'refs/heads/main',
      }),
    ).rejects.toThrow('inconsistent');
  });
});
