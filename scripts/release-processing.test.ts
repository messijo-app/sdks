import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ContractIngestionError } from './lib/contract-ingestion.mjs';
import {
  applyReleasePlan,
  compareSemVer,
  loadTrustedReceipts,
  planRelease,
  validateReceipt,
} from './lib/release-processing.mjs';

const receiverRunUrl = 'https://github.com/messijo-app/sdks/actions/runs/123';
const payload = (version: string, seed = 'a') => ({
  api_version: version,
  breaking_override_used: false,
  change_kind: 'additive',
  release_tag: `api-v${version}`,
  source_commit: seed.repeat(40),
  spec_sha256: seed.repeat(64),
  spec_url: 'https://api.messijo.com/openapi.json',
  stability: 'experimental',
});

const withRepository = async (
  callback: (repositoryRoot: string) => Promise<void>,
) => {
  const repositoryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'messijo-release-processing-'),
  );
  await mkdir(path.join(repositoryRoot, 'contracts/releases'), {
    recursive: true,
  });
  try {
    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { force: true, recursive: true });
  }
};

describe('trusted receipts and ordering', () => {
  it('validates the exact immutable receipt schema', () => {
    const plan = planRelease({
      payload: payload('0.1.0'),
      receipts: [],
      receiverRunUrl,
    });
    expect(validateReceipt(plan.receipt)).toEqual(plan.receipt);
    expect(() =>
      validateReceipt({ ...plan.receipt, unexpected: true }),
    ).toThrow('immutable schema');
  });

  it('orders stable and prerelease SemVer values correctly', () => {
    expect(compareSemVer('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareSemVer('0.2.0-beta.2', '0.2.0-beta.10')).toBeLessThan(0);
    expect(compareSemVer('0.2.0', '0.2.0-rc.1')).toBeGreaterThan(0);
  });

  it('applies a first latest release and exact replay as a no-op', async () => {
    await withRepository(async (repositoryRoot) => {
      let generations = 0;
      const firstPlan = planRelease({
        payload: payload('0.1.0'),
        receipts: [],
        receiverRunUrl,
      });
      const result = await applyReleasePlan({
        canonicalText: '{"version":"first"}\n',
        generate: async () => {
          generations += 1;
        },
        plan: firstPlan,
        repositoryRoot,
      });
      expect(result).toMatchObject({
        changed: true,
        disposition: 'latest-generation',
      });
      expect(generations).toBe(1);
      expect(
        await readFile(
          path.join(repositoryRoot, 'contracts/current/openapi.json'),
          'utf8',
        ),
      ).toBe('{"version":"first"}\n');

      const receipts = await loadTrustedReceipts(
        path.join(repositoryRoot, 'contracts/releases'),
      );
      const replay = planRelease({
        payload: payload('0.1.0'),
        receipts,
        receiverRunUrl,
      });
      expect(replay.kind).toBe('noop');
      await expect(
        applyReleasePlan({
          canonicalText: '{"version":"ignored"}\n',
          generate: async () => {
            generations += 1;
          },
          plan: replay,
          repositoryRoot,
        }),
      ).resolves.toEqual({ changed: false });
      expect(generations).toBe(1);
    });
  });

  it('fails hard on same-tag provenance conflicts', () => {
    const first = planRelease({
      payload: payload('0.1.0'),
      receipts: [],
      receiverRunUrl,
    });
    expect(() =>
      planRelease({
        payload: payload('0.1.0', 'b'),
        receipts: [first.receipt],
        receiverRunUrl,
      }),
    ).toThrow(ContractIngestionError);
  });

  it('keeps a delayed older release receipt-only after a newer release', async () => {
    await withRepository(async (repositoryRoot) => {
      const newer = planRelease({
        payload: payload('0.2.0', 'b'),
        receipts: [],
        receiverRunUrl,
      });
      await applyReleasePlan({
        canonicalText: '{"version":"newer"}\n',
        generate: async () => {},
        plan: newer,
        repositoryRoot,
      });
      const receipts = await loadTrustedReceipts(
        path.join(repositoryRoot, 'contracts/releases'),
      );
      const delayed = planRelease({
        payload: payload('0.1.0'),
        receipts,
        receiverRunUrl,
      });
      expect(delayed.kind).toBe('receipt-only');
      await applyReleasePlan({
        canonicalText: '{"version":"older"}\n',
        generate: async () => {
          throw new Error('receipt-only must not generate');
        },
        plan: delayed,
        repositoryRoot,
      });
      expect(
        await readFile(
          path.join(repositoryRoot, 'contracts/current/openapi.json'),
          'utf8',
        ),
      ).toBe('{"version":"newer"}\n');
    });
  });

  it('handles concurrent identical first-delivery writes idempotently', async () => {
    await withRepository(async (repositoryRoot) => {
      const first = planRelease({
        payload: payload('0.1.0'),
        receipts: [],
        receiverRunUrl,
      });
      const second = planRelease({
        payload: payload('0.1.0'),
        receipts: [],
        receiverRunUrl,
      });
      await expect(
        Promise.all(
          [first, second].map((plan) =>
            applyReleasePlan({
              canonicalText: '{"version":"same"}\n',
              generate: async () => {},
              plan,
              repositoryRoot,
            }),
          ),
        ),
      ).resolves.toHaveLength(2);
      await expect(
        loadTrustedReceipts(path.join(repositoryRoot, 'contracts/releases')),
      ).resolves.toHaveLength(1);
    });
  });
});

describe('receiver workflow boundaries', () => {
  it('serializes per tag and grants writes only after validation', async () => {
    const workflow = await readFile(
      path.resolve(
        import.meta.dirname,
        '../.github/workflows/api-contract-released.yml',
      ),
      'utf8',
    );
    expect(workflow).toContain('types: [api-contract-released]');
    expect(workflow).toContain(
      'group: api-contract-${{ github.event.client_payload.release_tag }}',
    );
    expect(workflow).toContain('needs: validate');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('This workflow never publishes npm packages.');
  });
});
