import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalizeJson,
  ContractIngestionError,
  downloadVerifiedContract,
  safeFailureDiagnostic,
  sha256,
  validateReleaseEvent,
  verifyContractText,
} from './lib/contract-ingestion.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const validContract = {
  info: {
    title: 'Messijo',
    version: '0.1.0',
    'x-stability': 'experimental',
  },
  openapi: '3.0.0',
  paths: {},
  servers: [{ url: 'https://api.messijo.com' }],
};
const validPayload = {
  api_version: '0.1.0',
  breaking_override_used: false,
  change_kind: 'additive',
  release_tag: 'api-v0.1.0',
  source_commit: 'a'.repeat(40),
  spec_sha256: sha256(canonicalizeJson(validContract)),
  spec_url: 'https://api.messijo.com/openapi.json',
  stability: 'experimental',
};
const validEvent = {
  action: 'api-contract-released',
  client_payload: validPayload,
};

describe('release event validation', () => {
  it('accepts the exact documented event', () => {
    expect(validateReleaseEvent(validEvent)).toEqual(validPayload);
  });

  it.each([
    ['unknown key', { ...validPayload, unknown: 'value' }],
    [
      'missing key',
      Object.fromEntries(
        Object.entries(validPayload).filter(([key]) => key !== 'stability'),
      ),
    ],
    ['string boolean', { ...validPayload, breaking_override_used: 'false' }],
    ['uppercase commit', { ...validPayload, source_commit: 'A'.repeat(40) }],
    ['uppercase checksum', { ...validPayload, spec_sha256: 'A'.repeat(64) }],
    ['invalid SemVer', { ...validPayload, api_version: '01.0.0' }],
    [
      'wrong URL',
      { ...validPayload, spec_url: 'https://example.test/openapi.json' },
    ],
    ['tag mismatch', { ...validPayload, release_tag: 'api-v0.2.0' }],
  ])('rejects %s', (_name, clientPayload) => {
    expect(() =>
      validateReleaseEvent({
        ...validEvent,
        client_payload: clientPayload,
      }),
    ).toThrow(ContractIngestionError);
  });

  it('enforces breaking override invariants', () => {
    expect(() =>
      validateReleaseEvent({
        ...validEvent,
        client_payload: {
          ...validPayload,
          breaking_override_used: true,
          change_kind: 'additive',
        },
      }),
    ).toThrow('breaking override invariants');
  });
});

describe('canonical contract verification', () => {
  it('matches the committed backend-jq golden bytes and checksum', () => {
    const input = JSON.parse(
      readFileSync(
        path.join(repositoryRoot, 'fixtures/canonical/input.json'),
        'utf8',
      ),
    );
    const expected = readFileSync(
      path.join(repositoryRoot, 'fixtures/canonical/expected.json'),
      'utf8',
    );

    expect(canonicalizeJson(input)).toBe(expected);
    expect(sha256(expected)).toBe(
      'cacb15f366324dc5fc6c018d85408057183b7cb808358ceaff275d30c86ec005',
    );
  });

  it.each([
    ['malformed JSON', '{', 'parse'],
    [
      'wrong server',
      JSON.stringify({
        ...validContract,
        servers: [{ url: 'https://example.test' }],
      }),
      'metadata',
    ],
    [
      'wrong version',
      JSON.stringify({
        ...validContract,
        info: { ...validContract.info, version: '0.2.0' },
      }),
      'metadata',
    ],
    [
      'wrong stability',
      JSON.stringify({
        ...validContract,
        info: { ...validContract.info, 'x-stability': 'stable' },
      }),
      'metadata',
    ],
  ])('rejects %s', (_name, text, stage) => {
    try {
      verifyContractText(text, validPayload);
      throw new Error('Expected contract verification failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractIngestionError);
      expect((error as ContractIngestionError).stage).toBe(stage);
    }
  });

  it('rejects a stale checksum', () => {
    expect(() =>
      verifyContractText(JSON.stringify(validContract), {
        ...validPayload,
        spec_sha256: 'b'.repeat(64),
      }),
    ).toThrow('checksum');
  });
});

describe('bounded production retrieval', () => {
  it('retries stale content with the bounded backoff and accepts convergence', async () => {
    const delays: number[] = [];
    let calls = 0;
    const staleContract = {
      ...validContract,
      paths: { '/stale': {} },
    };
    const result = await downloadVerifiedContract(validPayload, {
      fetch: async () => {
        calls += 1;
        return new Response(
          JSON.stringify(calls === 1 ? staleContract : validContract),
        );
      },
      sleep: async (delay: number) => {
        delays.push(delay);
      },
    });

    expect(result.attempts).toBe(2);
    expect(delays).toEqual([5_000]);
  });

  it('stops after five failures and rejects a different final origin', async () => {
    let calls = 0;
    await expect(
      downloadVerifiedContract(validPayload, {
        fetch: async () => {
          calls += 1;
          const response = new Response(JSON.stringify(validContract));
          Object.defineProperty(response, 'url', {
            value: 'https://example.test/openapi.json',
          });
          return response;
        },
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({
      attempts: 5,
      stage: 'retry-exhausted',
    });
    expect(calls).toBe(5);
  });
});

describe('failure diagnostics', () => {
  it('contains stage-specific safe values and omits causes', () => {
    const secret = `sk_live_${'a'.repeat(24)}`;
    const error = new ContractIngestionError('checksum', 'checksum mismatch', {
      actual: { checksum: 'a'.repeat(64) },
      cause: new Error(secret),
      expected: { checksum: 'b'.repeat(64) },
    });
    const diagnostic = safeFailureDiagnostic(error, 'api-v0.1.0');

    expect(diagnostic).toMatchObject({
      releaseTag: 'api-v0.1.0',
      stage: 'checksum',
    });
    expect(JSON.stringify(diagnostic)).not.toContain(secret);
  });
});
