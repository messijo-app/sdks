import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  downloadVerifiedContract,
  safeFailureDiagnostic,
  validateReleaseEvent,
} from './lib/contract-ingestion.mjs';

const [eventPath, outputPath] = process.argv.slice(2);
if (!eventPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/ingest-contract.mjs <event.json> <output.json>',
  );
}

let payload;
try {
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  payload = validateReleaseEvent(event);
  const result = await downloadVerifiedContract(payload);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.canonicalText);
  process.stdout.write(
    `${JSON.stringify({
      attempts: result.attempts,
      checksum: result.checksum,
      releaseTag: payload.release_tag,
      stage: 'verified',
    })}\n`,
  );
} catch (error) {
  const diagnostic = safeFailureDiagnostic(
    error,
    payload?.release_tag ?? 'unvalidated',
  );
  const diagnosticDirectory =
    process.env.MESSIJO_DIAGNOSTICS_DIR ?? 'artifacts/contract-ingestion';
  await mkdir(diagnosticDirectory, { recursive: true });
  await writeFile(
    path.join(diagnosticDirectory, 'failure.json'),
    `${JSON.stringify(diagnostic, null, 2)}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Contract ingestion failed\n\n- Release: \`${diagnostic.releaseTag}\`\n- Stage: \`${diagnostic.stage}\`\n- Action: inspect the redacted diagnostic artifact, correct the release input or retry after production converges.\n`,
      { flag: 'a' },
    );
  }
  throw error;
}
