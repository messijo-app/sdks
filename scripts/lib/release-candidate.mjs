import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { validateBumpRecord } from './publication.mjs';
import { validateReceipt } from './release-processing.mjs';

const execFileAsync = promisify(execFile);
const commitPattern = /^[0-9a-f]{40}$/u;
const branchPattern = /^refs\/heads\/[A-Za-z0-9._/-]+$/u;
const defaultBranchPattern = /^[A-Za-z0-9._/-]+$/u;
const languagePattern = /^[a-z][a-z0-9-]*$/u;
const releaseTagPattern = /^api-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export class ReleaseCandidateError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = 'ReleaseCandidateError';
    this.stage = stage;
  }
}

const assertMatch = (value, pattern, stage, label) => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ReleaseCandidateError(stage, `${label} is invalid`);
  }
};

export const validateCandidateContext = async ({
  candidateSha,
  checkedOutSha,
  defaultBranch,
  isAncestor,
  selectedRef,
}) => {
  assertMatch(candidateSha, commitPattern, 'candidate-sha', 'candidate SHA');
  assertMatch(
    checkedOutSha,
    commitPattern,
    'checked-out-sha',
    'checked-out SHA',
  );
  assertMatch(selectedRef, branchPattern, 'selected-ref', 'selected ref');
  assertMatch(
    defaultBranch,
    defaultBranchPattern,
    'default-branch',
    'default branch',
  );

  if (checkedOutSha !== candidateSha) {
    throw new ReleaseCandidateError(
      'checked-out-sha',
      'checked-out SHA does not equal the immutable dispatch SHA',
    );
  }
  if (!(await isAncestor(candidateSha, `origin/${defaultBranch}`))) {
    throw new ReleaseCandidateError(
      'default-branch-ancestry',
      'candidate SHA is not an ancestor of the current default branch',
    );
  }

  return {
    candidateSha,
    defaultBranch,
    eligibilityResult: 'eligible',
    selectedRef,
  };
};

const readJson = async (filePath, stage, label) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new ReleaseCandidateError(
      stage,
      `${label} is missing or invalid: ${error.message}`,
    );
  }
};

const resolveBumpPath = async (repositoryRoot, language, releaseTag) => {
  const languagePath = path.join(
    repositoryRoot,
    'release-bumps',
    language,
    `${releaseTag}.json`,
  );
  try {
    await access(languagePath);
    return languagePath;
  } catch {
    if (language === 'typescript') {
      return path.join(repositoryRoot, 'release-bumps', `${releaseTag}.json`);
    }
    return languagePath;
  }
};

export const validateReleaseCandidate = async ({
  candidateSha,
  checkedOutSha,
  defaultBranch,
  isAncestor,
  language,
  releaseTag,
  repositoryRoot,
  selectedRef,
}) => {
  assertMatch(language, languagePattern, 'language', 'SDK language');
  assertMatch(
    releaseTag,
    releaseTagPattern,
    'release-inputs',
    'API release tag',
  );

  const context = await validateCandidateContext({
    candidateSha,
    checkedOutSha,
    defaultBranch,
    isAncestor,
    selectedRef,
  });
  const receipt = validateReceipt(
    await readJson(
      path.join(repositoryRoot, 'contracts', 'releases', `${releaseTag}.json`),
      'release-inputs',
      'trusted receipt',
    ),
  );
  const bump = validateBumpRecord(
    await readJson(
      await resolveBumpPath(repositoryRoot, language, releaseTag),
      'release-inputs',
      `${language} bump record`,
    ),
  );

  if (
    receipt.release_tag !== releaseTag ||
    bump.release_tag !== releaseTag ||
    bump.api_version !== receipt.api_version ||
    bump.spec_sha256 !== receipt.spec_sha256 ||
    bump.backend_source_commit !== receipt.backend_source_commit
  ) {
    throw new ReleaseCandidateError(
      'release-inputs',
      'trusted receipt and language bump record are inconsistent',
    );
  }

  return context;
};

export const gitIsAncestor = async (repositoryRoot, ancestor, descendant) => {
  try {
    await execFileAsync(
      'git',
      ['merge-base', '--is-ancestor', ancestor, descendant],
      { cwd: repositoryRoot },
    );
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
};
