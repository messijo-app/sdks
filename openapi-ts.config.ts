import path from 'node:path';

import { resolveOpenApiInput } from './scripts/lib/generation-input.mjs';

const repositoryRoot = import.meta.dirname;
const configuredInput =
  process.env.MESSIJO_OPENAPI_INPUT ?? 'fixtures/openapi/intended-0.1.0.json';
const input = resolveOpenApiInput(repositoryRoot, configuredInput);

export default {
  input,
  output: path.resolve(repositoryRoot, 'packages/typescript/src/generated'),
  plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk'],
};
