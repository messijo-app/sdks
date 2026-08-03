import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const readRepositoryFile = (filePath: string) =>
  readFile(path.join(repositoryRoot, filePath), 'utf8');

describe('maintainer release runbook', () => {
  it('is linked prominently from the root release guidance', async () => {
    const readme = await readRepositoryFile('README.md');
    expect(readme).toContain('## Release and repair flow');
    expect(readme).toContain(
      '[contract intake and SDK release runbook](docs/contract-and-sdk-release-runbook.md)',
    );
  });

  it('catalogs every implemented workflow and labels planned C# workflows', async () => {
    const [runbook, receiver, preparation, publication] = await Promise.all([
      readRepositoryFile('docs/contract-and-sdk-release-runbook.md'),
      readRepositoryFile('.github/workflows/api-contract-released.yml'),
      readRepositoryFile('.github/workflows/prepare-release.yml'),
      readRepositoryFile('.github/workflows/publish.yml'),
    ]);
    for (const workflowName of [
      receiver.match(/^name: (.+)$/mu)?.[1],
      preparation.match(/^name: (.+)$/mu)?.[1],
      publication.match(/^name: (.+)$/mu)?.[1],
    ]) {
      expect(workflowName).toBeTruthy();
      expect(runbook).toContain(`**${workflowName}**`);
    }
    expect(runbook).toContain('| Planned | C# release preparation |');
    expect(runbook).toContain('| Planned | C# NuGet publication |');
    expect(runbook).toContain('must not be treated as implemented');
  });

  it('records protected tag patterns and required safety language', async () => {
    const runbook = await readRepositoryFile(
      'docs/contract-and-sdk-release-runbook.md',
    );
    for (const requiredText of [
      'sdk-typescript-v*',
      'sdk-csharp-v*',
      'Never manually replace `contracts/current/openapi.json`',
      'manufacture a `repository_dispatch` payload',
      'Never move or reuse a release tag',
      'Push outcome uncertain',
      'corrective version',
      'api-contract-released',
      'release-bumps',
      'default branch',
      'dispatch-time SHA',
    ]) {
      expect(runbook).toContain(requiredText);
    }
  });

  it('retains the handoff and registry bootstrap records', async () => {
    const runbook = await readRepositoryFile(
      'docs/contract-and-sdk-release-runbook.md',
    );
    expect(runbook).toContain('(sdk-repository-handoff.md)');
    expect(runbook).toContain('(npm-publication-bootstrap.md)');
  });
});
