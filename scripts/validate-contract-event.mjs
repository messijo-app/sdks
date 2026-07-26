import { readFile } from 'node:fs/promises';

import { validateReleaseEvent } from './lib/contract-ingestion.mjs';

const eventPath = process.argv[2] ?? process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  throw new Error('Pass an event JSON file or set GITHUB_EVENT_PATH');
}
const event = JSON.parse(await readFile(eventPath, 'utf8'));
const payload = validateReleaseEvent(event);
process.stdout.write(
  `${JSON.stringify({
    apiVersion: payload.api_version,
    releaseTag: payload.release_tag,
    stage: 'validated',
  })}\n`,
);
