import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resolveOpenApiInput } from './lib/generation-input.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const fixtureMetadataPath = path.join(
  repositoryRoot,
  'fixtures/openapi/intended-0.1.0.fixture.json',
);
const receiptsDirectory = path.join(repositoryRoot, 'contracts/releases');

const loadConfiguredInput = async (configuredInput?: string) => {
  const previousInput = process.env.MESSIJO_OPENAPI_INPUT;
  if (configuredInput === undefined) {
    delete process.env.MESSIJO_OPENAPI_INPUT;
  } else {
    process.env.MESSIJO_OPENAPI_INPUT = configuredInput;
  }
  vi.resetModules();

  try {
    const { default: config } = await import('../openapi-ts.config');
    return config.input;
  } finally {
    if (previousInput === undefined) {
      delete process.env.MESSIJO_OPENAPI_INPUT;
    } else {
      process.env.MESSIJO_OPENAPI_INPUT = previousInput;
    }
  }
};

describe('generation input policy', () => {
  it('uses the canonical contract by default', async () => {
    await expect(loadConfiguredInput()).resolves.toBe(
      path.join(repositoryRoot, 'contracts/current/openapi.json'),
    );
  });

  it('preserves explicit repository-local fixture and receiver inputs', async () => {
    await expect(
      loadConfiguredInput('fixtures/openapi/intended-0.1.0.json'),
    ).resolves.toBe(
      path.join(repositoryRoot, 'fixtures/openapi/intended-0.1.0.json'),
    );
    await expect(
      loadConfiguredInput('contracts/current/openapi.json'),
    ).resolves.toBe(
      path.join(repositoryRoot, 'contracts/current/openapi.json'),
    );
  });

  it('resolves only repository-local files', () => {
    expect(
      resolveOpenApiInput(
        repositoryRoot,
        'fixtures/openapi/intended-0.1.0.json',
      ),
    ).toBe(path.join(repositoryRoot, 'fixtures/openapi/intended-0.1.0.json'));
    expect(() =>
      resolveOpenApiInput(
        repositoryRoot,
        'https://api.messijo.com/openapi.json',
      ),
    ).toThrow('repository-local file path');
    expect(() =>
      resolveOpenApiInput(repositoryRoot, '../api/openapi.public.json'),
    ).toThrow('inside this repository');
  });

  it('keeps fixture generation outside every trust and publication path', () => {
    const metadata = JSON.parse(readFileSync(fixtureMetadataPath, 'utf8')) as {
      publishable: boolean;
      trustedReceiptEligible: boolean;
    };
    const receiptsBefore = readdirSync(receiptsDirectory).sort();
    const publishWorkflowPath = path.join(
      repositoryRoot,
      '.github/workflows/publish.yml',
    );
    const publishWorkflowBefore = readFileSync(publishWorkflowPath, 'utf8');

    execFileSync(process.execPath, ['scripts/generate.mjs'], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MESSIJO_OPENAPI_INPUT: 'fixtures/openapi/intended-0.1.0.json',
      },
      stdio: 'pipe',
    });

    expect(metadata.publishable).toBe(false);
    expect(metadata.trustedReceiptEligible).toBe(false);
    expect(readdirSync(receiptsDirectory).sort()).toEqual(receiptsBefore);
    expect(readFileSync(publishWorkflowPath, 'utf8')).toBe(
      publishWorkflowBefore,
    );
    expect(publishWorkflowBefore).toContain(
      "if: vars.SDK_NPM_PUBLICATION_ENABLED == 'true'",
    );
  });
});
