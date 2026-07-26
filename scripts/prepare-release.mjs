import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  downloadVerifiedContract,
  validateReleaseEvent,
} from './lib/contract-ingestion.mjs';

const [eventPath, outputDirectory] = process.argv.slice(2);
if (!eventPath || !outputDirectory) {
  throw new Error(
    'Usage: node scripts/prepare-release.mjs <event.json> <output-directory>',
  );
}
const event = JSON.parse(await readFile(eventPath, 'utf8'));
const payload = validateReleaseEvent(event);
const verified = await downloadVerifiedContract(payload);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'payload.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
);
await writeFile(
  path.join(outputDirectory, 'openapi.json'),
  verified.canonicalText,
);
