import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ContractIngestionError,
  parseSemVer,
  validateReleaseEvent,
} from './contract-ingestion.mjs';

const receiptKeys = [
  'api_version',
  'backend_source_commit',
  'breaking_override_used',
  'change_kind',
  'processing_disposition',
  'receiver_run_url',
  'release_tag',
  'schema_version',
  'spec_sha256',
  'spec_url',
  'stability',
].sort();
const dispositions = ['latest-generation', 'receipt-only'];

const comparePrerelease = (left, right) => {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) < Number(rightPart) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
};

export const compareSemVer = (leftVersion, rightVersion) => {
  const left = parseSemVer(leftVersion);
  const right = parseSemVer(rightVersion);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
};

export const validateReceipt = (receipt) => {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new ContractIngestionError(
      'receipt-validation',
      'trusted receipt must be a JSON object',
    );
  }
  const actualKeys = Object.keys(receipt).sort();
  if (
    actualKeys.length !== receiptKeys.length ||
    actualKeys.some((key, index) => key !== receiptKeys[index])
  ) {
    throw new ContractIngestionError(
      'receipt-validation',
      'trusted receipt keys do not match the immutable schema',
    );
  }
  if (receipt.schema_version !== 1) {
    throw new ContractIngestionError(
      'receipt-validation',
      'unsupported trusted receipt schema version',
    );
  }
  if (!dispositions.includes(receipt.processing_disposition)) {
    throw new ContractIngestionError(
      'receipt-validation',
      'invalid processing disposition',
    );
  }
  if (
    typeof receipt.receiver_run_url !== 'string' ||
    !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/u.test(
      receipt.receiver_run_url,
    )
  ) {
    throw new ContractIngestionError(
      'receipt-validation',
      'receiver_run_url must identify a GitHub Actions run',
    );
  }
  validateReleaseEvent({
    action: 'api-contract-released',
    client_payload: {
      api_version: receipt.api_version,
      breaking_override_used: receipt.breaking_override_used,
      change_kind: receipt.change_kind,
      release_tag: receipt.release_tag,
      source_commit: receipt.backend_source_commit,
      spec_sha256: receipt.spec_sha256,
      spec_url: receipt.spec_url,
      stability: receipt.stability,
    },
  });
  return Object.freeze({ ...receipt });
};

export const loadTrustedReceipts = async (receiptsDirectory) => {
  try {
    await access(receiptsDirectory, constants.R_OK);
  } catch {
    return [];
  }
  const files = (await readdir(receiptsDirectory))
    .filter((file) => file.endsWith('.json'))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      validateReceipt(
        JSON.parse(await readFile(path.join(receiptsDirectory, file), 'utf8')),
      ),
    ),
  );
};

const receiptMatchesPayload = (receipt, payload) =>
  receipt.api_version === payload.api_version &&
  receipt.backend_source_commit === payload.source_commit &&
  receipt.breaking_override_used === payload.breaking_override_used &&
  receipt.change_kind === payload.change_kind &&
  receipt.release_tag === payload.release_tag &&
  receipt.spec_sha256 === payload.spec_sha256 &&
  receipt.spec_url === payload.spec_url &&
  receipt.stability === payload.stability;

export const recommendSdkBump = (changeKind) =>
  changeKind === 'corrective' ? 'patch' : 'minor';

export const createReceipt = (payload, receiverRunUrl, processingDisposition) =>
  validateReceipt({
    api_version: payload.api_version,
    backend_source_commit: payload.source_commit,
    breaking_override_used: payload.breaking_override_used,
    change_kind: payload.change_kind,
    processing_disposition: processingDisposition,
    receiver_run_url: receiverRunUrl,
    release_tag: payload.release_tag,
    schema_version: 1,
    spec_sha256: payload.spec_sha256,
    spec_url: payload.spec_url,
    stability: payload.stability,
  });

export const planRelease = ({ payload, receipts, receiverRunUrl }) => {
  const existing = receipts.find(
    (receipt) => receipt.release_tag === payload.release_tag,
  );
  if (existing) {
    if (receiptMatchesPayload(existing, payload)) {
      return { kind: 'noop', receipt: existing };
    }
    throw new ContractIngestionError(
      'provenance-conflict',
      'release tag conflicts with an immutable trusted receipt',
      {
        actual: {
          sourceCommit: payload.source_commit,
          specSha256: payload.spec_sha256,
        },
        expected: {
          sourceCommit: existing.backend_source_commit,
          specSha256: existing.spec_sha256,
        },
      },
    );
  }

  const greatestVersion = receipts.reduce(
    (greatest, receipt) =>
      greatest === undefined || compareSemVer(receipt.api_version, greatest) > 0
        ? receipt.api_version
        : greatest,
    undefined,
  );
  const older =
    greatestVersion !== undefined &&
    compareSemVer(payload.api_version, greatestVersion) < 0;
  const disposition = older ? 'receipt-only' : 'latest-generation';
  return {
    bump:
      disposition === 'latest-generation'
        ? {
            api_version: payload.api_version,
            backend_source_commit: payload.source_commit,
            change_kind: payload.change_kind,
            generator: '@hey-api/openapi-ts@0.99.0',
            recommendation: recommendSdkBump(payload.change_kind),
            release_tag: payload.release_tag,
            schema_version: 1,
            spec_sha256: payload.spec_sha256,
          }
        : undefined,
    kind: disposition,
    receipt: createReceipt(payload, receiverRunUrl, disposition),
  };
};

const writeJson = (file, value) =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

const writeImmutableReceipt = async (file, receipt) => {
  try {
    await writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: 'wx',
    });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = validateReceipt(JSON.parse(await readFile(file, 'utf8')));
    if (JSON.stringify(existing) !== JSON.stringify(receipt)) {
      throw new ContractIngestionError(
        'provenance-conflict',
        'trusted receipt file already contains different provenance',
      );
    }
  }
};

export const applyReleasePlan = async ({
  canonicalText,
  generate,
  plan,
  repositoryRoot,
}) => {
  if (plan.kind === 'noop') return { changed: false };

  const receiptsDirectory = path.join(repositoryRoot, 'contracts/releases');
  await mkdir(receiptsDirectory, { recursive: true });

  if (plan.kind === 'latest-generation') {
    const currentContract = path.join(
      repositoryRoot,
      'contracts/current/openapi.json',
    );
    await mkdir(path.dirname(currentContract), { recursive: true });
    await writeFile(currentContract, canonicalText);
    await generate(currentContract);
    const bumpDirectory = path.join(repositoryRoot, 'release-bumps');
    await mkdir(bumpDirectory, { recursive: true });
    await writeJson(
      path.join(bumpDirectory, `${plan.receipt.release_tag}.json`),
      plan.bump,
    );
  }

  await writeImmutableReceipt(
    path.join(receiptsDirectory, `${plan.receipt.release_tag}.json`),
    plan.receipt,
  );
  return { changed: true, disposition: plan.kind };
};
