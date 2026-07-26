import { spawnSync } from 'node:child_process';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const generatedRelative = 'packages/typescript/src/generated';
const generatedDirectory = path.join(repositoryRoot, generatedRelative);
const check = process.argv.includes('--check');

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const collectTypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
    }),
  );
  return files.flat().sort();
};

await rm(generatedDirectory, { force: true, recursive: true });
run(process.execPath, [
  path.join(
    repositoryRoot,
    'tools/generator/node_modules/@hey-api/openapi-ts/bin/run.js',
  ),
]);

const prettierConfig = (await prettier.resolveConfig(repositoryRoot)) ?? {};
for (const file of await collectTypeScriptFiles(generatedDirectory)) {
  const source = await readFile(file, 'utf8');
  const formatted = await prettier.format(source, {
    ...prettierConfig,
    filepath: file,
  });
  await writeFile(file, formatted);
}

if (check) {
  run('git', ['diff', '--exit-code', '--', generatedRelative]);
  const untracked = spawnSync(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', generatedRelative],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );
  if (untracked.status !== 0) {
    process.exit(untracked.status ?? 1);
  }
  if (untracked.stdout.trim()) {
    process.stderr.write(
      `Generated output contains untracked files:\n${untracked.stdout}`,
    );
    process.exit(1);
  }
}
