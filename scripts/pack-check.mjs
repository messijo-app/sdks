import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const packageDirectory = path.join(repositoryRoot, 'packages/typescript');
const artifactsDirectory = path.join(repositoryRoot, 'artifacts/package');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result.stdout;
};

await rm(artifactsDirectory, { force: true, recursive: true });
await mkdir(artifactsDirectory, { recursive: true });
run('pnpm', ['build']);
run('node', [
  'scripts/safety-scan.mjs',
  'packages/typescript/dist',
  'packages/typescript/README.md',
  'packages/typescript/package.json',
]);

const packOutput = run(
  'npm',
  [
    'pack',
    '--json',
    '--pack-destination',
    artifactsDirectory,
    '--cache',
    path.join(artifactsDirectory, '.npm-cache'),
  ],
  { capture: true, cwd: packageDirectory },
);
const [packResult] = JSON.parse(packOutput);
const packedFiles = packResult.files.map(({ path: filePath }) => filePath);
const allowedFile = /^(?:README\.md|package\.json|dist\/.+)$/u;
const unexpectedFiles = packedFiles.filter(
  (filePath) =>
    !allowedFile.test(filePath) ||
    /(?:^|\/)[^/]*\.test\.[^/]+$/u.test(filePath),
);

if (unexpectedFiles.length > 0) {
  process.stderr.write(
    `Unexpected package files:\n${unexpectedFiles.join('\n')}\n`,
  );
  process.exit(1);
}
for (const requiredFile of ['dist/index.js', 'dist/index.d.ts']) {
  if (!packedFiles.includes(requiredFile)) {
    process.stderr.write(`Packed SDK is missing ${requiredFile}\n`);
    process.exit(1);
  }
}

const tarballPath = path.join(artifactsDirectory, packResult.filename);
const consumerDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'messijo-sdk-consumer-'),
);

try {
  await writeFile(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'messijo-sdk-packed-consumer',
        private: true,
        type: 'module',
      },
      null,
      2,
    )}\n`,
  );
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--cache',
      path.join(consumerDirectory, '.npm-cache'),
      tarballPath,
    ],
    { cwd: consumerDirectory },
  );
  await writeFile(
    path.join(consumerDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ['ES2024', 'DOM', 'DOM.Iterable'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2024',
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(consumerDirectory, 'consumer.ts'),
    `import { createMessijoClient, type CreateKeywordParams } from '@messijo/sdk';

const keyword: CreateKeywordParams = {
  ignored_users: [],
  is_whole_word: true,
  parts: [{ is_whole_word: true, value: 'messijo' }],
  platforms: ['hackernews'],
  type: 'compound',
  value: 'messijo',
};
const client = createMessijoClient({
  apiKey: 'packed-consumer-key',
  fetch: async () => new Response(JSON.stringify({ keywords: [] }), {
    headers: { 'content-type': 'application/json' },
  }),
});
await client.listKeywords({ path: { org_id: 'org-id' } });
await client.createKeyword({ body: keyword, path: { org_id: 'org-id' } });
`,
  );
  run(
    process.execPath,
    [
      path.join(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--project',
      'tsconfig.json',
    ],
    { cwd: consumerDirectory },
  );
  await writeFile(
    path.join(consumerDirectory, 'consumer.mjs'),
    `import { createMessijoClient, MessijoApiError } from '@messijo/sdk';

const requests = [];
const client = createMessijoClient({
  apiKey: 'packed-consumer-key',
  fetch: async (request) => {
    requests.push(request);
    if (requests.length === 3) {
      return new Response(JSON.stringify({ error: 'expected' }), {
        headers: { 'content-type': 'application/json' },
        status: 400,
      });
    }
    return new Response(JSON.stringify({ keywords: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  },
});
await client.listKeywords({ path: { org_id: 'org-id' } });
await client.createKeyword({
  body: {
    ignored_users: [],
    is_whole_word: true,
    parts: [{ is_whole_word: true, value: 'messijo' }],
    platforms: ['hackernews'],
    type: 'compound',
    value: 'messijo',
  },
  path: { org_id: 'org-id' },
});
try {
  await client.listKeywords({ path: { org_id: 'org-id' } });
  throw new Error('Expected API error');
} catch (error) {
  if (!(error instanceof MessijoApiError) || error.status !== 400) throw error;
}
if (requests.some((request) => request.headers.get('X-API-Key') !== 'packed-consumer-key')) {
  throw new Error('Packed consumer authentication failed');
}
`,
  );
  run(process.execPath, ['consumer.mjs'], { cwd: consumerDirectory });
} finally {
  await rm(consumerDirectory, { force: true, recursive: true });
}

const manifest = JSON.parse(
  await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
);
if (manifest.name !== '@messijo/sdk') {
  throw new Error('Packed package coordinate changed unexpectedly');
}
