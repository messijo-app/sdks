import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import {
  gitIsAncestor,
  validateReleaseCandidate,
} from './lib/release-candidate.mjs';

const execFileAsync = promisify(execFile);
const [releaseTag, language = 'typescript'] = process.argv.slice(2);
if (!releaseTag) {
  throw new Error(
    'Usage: node scripts/validate-release-candidate.mjs <api-release-tag> [language]',
  );
}

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const candidateSha = process.env.CANDIDATE_SHA ?? process.env.GITHUB_SHA ?? '';
const selectedRef = process.env.SELECTED_REF ?? process.env.GITHUB_REF ?? '';
const defaultBranch = process.env.DEFAULT_BRANCH ?? '';
const outputPath = process.env.GITHUB_OUTPUT;

const writeOutputs = async (eligibilityResult) => {
  if (!outputPath) return;
  await appendFile(
    outputPath,
    [
      `candidate_sha=${candidateSha}`,
      `selected_ref=${selectedRef}`,
      `default_branch=${defaultBranch}`,
      `eligibility_result=${eligibilityResult}`,
      '',
    ].join('\n'),
  );
};

try {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
  });
  await validateReleaseCandidate({
    candidateSha,
    checkedOutSha: stdout.trim(),
    defaultBranch,
    isAncestor: (ancestor, descendant) =>
      gitIsAncestor(repositoryRoot, ancestor, descendant),
    language,
    releaseTag,
    repositoryRoot,
    selectedRef,
  });
  await writeOutputs('eligible');
  console.log(`Eligible release candidate ${candidateSha}`);
} catch (error) {
  await writeOutputs('ineligible');
  const stage = error.stage ? ` (${error.stage})` : '';
  console.error(
    `Release candidate validation failed${stage}: ${error.message}`,
  );
  process.exitCode = 1;
}
