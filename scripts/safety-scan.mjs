import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanPaths } from './lib/safety-scan.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const requestedPaths =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ['contracts', 'fixtures/openapi', 'packages/typescript', 'artifacts'];
const existingPaths = [];

for (const requestedPath of requestedPaths) {
  const absolutePath = path.resolve(repositoryRoot, requestedPath);
  try {
    await access(absolutePath);
    existingPaths.push(absolutePath);
  } catch {
    // Optional artifact inputs do not exist in every workflow stage.
  }
}

const findings = await scanPaths(existingPaths);
if (findings.length > 0) {
  for (const finding of findings) {
    const relative = path.relative(repositoryRoot, finding.file);
    process.stderr.write(
      `${relative}: blocked by ${finding.ruleId}; matched content redacted\n`,
    );
  }
  process.exit(1);
}
