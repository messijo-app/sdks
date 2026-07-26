import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  loadTrustedReceipts,
  planRelease,
  applyReleasePlan,
} from './lib/release-processing.mjs';

const [preparedDirectory, receiverRunUrl] = process.argv.slice(2);
if (!preparedDirectory || !receiverRunUrl) {
  throw new Error(
    'Usage: node scripts/apply-release.mjs <prepared-directory> <receiver-run-url>',
  );
}
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const payload = JSON.parse(
  await readFile(path.join(preparedDirectory, 'payload.json'), 'utf8'),
);
const canonicalText = await readFile(
  path.join(preparedDirectory, 'openapi.json'),
  'utf8',
);
const receipts = await loadTrustedReceipts(
  path.join(repositoryRoot, 'contracts/releases'),
);
const plan = planRelease({ payload, receipts, receiverRunUrl });
const result = await applyReleasePlan({
  canonicalText,
  generate: (inputPath) => {
    const generated = spawnSync(process.execPath, ['scripts/generate.mjs'], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MESSIJO_OPENAPI_INPUT: path.relative(repositoryRoot, inputPath),
      },
      stdio: 'inherit',
    });
    if (generated.status !== 0) {
      throw new Error('SDK generation failed');
    }
  },
  plan,
  repositoryRoot,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
