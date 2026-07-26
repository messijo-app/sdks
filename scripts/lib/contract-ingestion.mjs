import { createHash } from 'node:crypto';

export const RELEASE_EVENT_TYPE = 'api-contract-released';
export const PRODUCTION_SPEC_URL = 'https://api.messijo.com/openapi.json';
export const PRODUCTION_API_URL = 'https://api.messijo.com';
export const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000];

const payloadKeys = [
  'api_version',
  'breaking_override_used',
  'change_kind',
  'release_tag',
  'source_commit',
  'spec_sha256',
  'spec_url',
  'stability',
].sort();
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|[a-z-][0-9a-z-]*))*))?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/iu;

export class ContractIngestionError extends Error {
  constructor(stage, message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = 'ContractIngestionError';
    this.stage = stage;
    this.attempts = details.attempts;
    this.actual = details.actual;
    this.expected = details.expected;
  }
}

const requireString = (payload, key) => {
  if (typeof payload[key] !== 'string') {
    throw new ContractIngestionError(
      'validation',
      `${key} must be a JSON string`,
    );
  }
};

export const parseSemVer = (version) => {
  const match = semverPattern.exec(version);
  if (!match) {
    throw new ContractIngestionError(
      'validation',
      'api_version must be valid SemVer',
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
    version,
  };
};

export const validateReleaseEvent = (event) => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new ContractIngestionError(
      'validation',
      'release event must be a JSON object',
    );
  }
  const eventType = event.event_type ?? event.action;
  if (eventType !== RELEASE_EVENT_TYPE) {
    throw new ContractIngestionError(
      'validation',
      `event type must be ${RELEASE_EVENT_TYPE}`,
    );
  }
  const payload = event.client_payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ContractIngestionError(
      'validation',
      'client_payload must be a JSON object',
    );
  }
  const actualKeys = Object.keys(payload).sort();
  if (
    actualKeys.length !== payloadKeys.length ||
    actualKeys.some((key, index) => key !== payloadKeys[index])
  ) {
    throw new ContractIngestionError(
      'validation',
      'client_payload keys must match the release contract exactly',
      { actual: actualKeys, expected: payloadKeys },
    );
  }

  for (const key of payloadKeys.filter(
    (key) => key !== 'breaking_override_used',
  )) {
    requireString(payload, key);
  }
  if (typeof payload.breaking_override_used !== 'boolean') {
    throw new ContractIngestionError(
      'validation',
      'breaking_override_used must be a JSON boolean',
    );
  }

  const version = parseSemVer(payload.api_version);
  if (!/^[0-9a-f]{40}$/u.test(payload.source_commit)) {
    throw new ContractIngestionError(
      'validation',
      'source_commit must be 40 lowercase hexadecimal characters',
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(payload.spec_sha256)) {
    throw new ContractIngestionError(
      'validation',
      'spec_sha256 must be 64 lowercase hexadecimal characters',
    );
  }
  if (payload.spec_url !== PRODUCTION_SPEC_URL) {
    throw new ContractIngestionError(
      'validation',
      `spec_url must be ${PRODUCTION_SPEC_URL}`,
    );
  }
  if (payload.stability !== 'experimental') {
    throw new ContractIngestionError(
      'validation',
      'stability must be experimental',
    );
  }
  if (!['additive', 'breaking', 'corrective'].includes(payload.change_kind)) {
    throw new ContractIngestionError(
      'validation',
      'change_kind has an unsupported value',
    );
  }
  if (payload.release_tag !== `api-v${payload.api_version}`) {
    throw new ContractIngestionError(
      'validation',
      'release_tag must match api_version',
    );
  }
  if (
    payload.breaking_override_used &&
    (payload.change_kind !== 'breaking' ||
      payload.stability !== 'experimental' ||
      version.major !== 0)
  ) {
    throw new ContractIngestionError(
      'validation',
      'breaking override invariants are not satisfied',
    );
  }
  return Object.freeze({ ...payload });
};

const canonicalizeValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeValue(value[key])]),
    );
  }
  return value;
};

export const canonicalizeJson = (value) =>
  `${JSON.stringify(canonicalizeValue(value))}\n`;

export const sha256 = (value) =>
  createHash('sha256').update(value).digest('hex');

export const verifyContractText = (text, payload) => {
  let contract;
  try {
    contract = JSON.parse(text);
  } catch (cause) {
    throw new ContractIngestionError(
      'parse',
      'downloaded contract is not valid JSON',
      { cause },
    );
  }
  const version = contract?.info?.version;
  const stability = contract?.info?.['x-stability'];
  const servers = contract?.servers;
  const serverUrls = Array.isArray(servers)
    ? servers.map((server) => server?.url)
    : [];
  if (
    version !== payload.api_version ||
    stability !== payload.stability ||
    serverUrls.length !== 1 ||
    serverUrls[0] !== PRODUCTION_API_URL
  ) {
    throw new ContractIngestionError(
      'metadata',
      'downloaded contract metadata does not match the release event',
      {
        actual: { serverUrls, stability, version },
        expected: {
          serverUrls: [PRODUCTION_API_URL],
          stability: payload.stability,
          version: payload.api_version,
        },
      },
    );
  }
  const canonicalText = canonicalizeJson(contract);
  const checksum = sha256(canonicalText);
  if (checksum !== payload.spec_sha256) {
    throw new ContractIngestionError(
      'checksum',
      'canonical contract checksum does not match the release event',
      {
        actual: { checksum },
        expected: { checksum: payload.spec_sha256 },
      },
    );
  }
  return {
    canonicalText,
    checksum,
    contract,
  };
};

const defaultSleep = (delayMs) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export const downloadVerifiedContract = async (payload, options = {}) => {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? defaultSleep;
  let lastError;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetchImplementation(PRODUCTION_SPEC_URL, {
        headers: { accept: 'application/json' },
        redirect: 'follow',
      });
      const finalUrl = response.url || PRODUCTION_SPEC_URL;
      if (new URL(finalUrl).origin !== PRODUCTION_API_URL) {
        throw new ContractIngestionError(
          'download',
          'contract redirect left the production origin',
          {
            actual: { finalOrigin: new URL(finalUrl).origin },
            expected: { finalOrigin: PRODUCTION_API_URL },
          },
        );
      }
      if (!response.ok) {
        throw new ContractIngestionError(
          'download',
          `contract download returned HTTP ${response.status}`,
          { actual: { status: response.status } },
        );
      }
      return {
        ...verifyContractText(await response.text(), payload),
        attempts: attempt,
        finalUrl,
      };
    } catch (cause) {
      lastError =
        cause instanceof ContractIngestionError
          ? cause
          : new ContractIngestionError('download', 'contract download failed', {
              cause,
            });
      if (attempt < 5) {
        await sleep(RETRY_DELAYS_MS[attempt - 1]);
      }
    }
  }

  throw new ContractIngestionError(
    'retry-exhausted',
    `contract verification failed after 5 attempts at stage ${lastError.stage}`,
    {
      actual: lastError.actual,
      attempts: 5,
      cause: lastError,
      expected: lastError.expected,
    },
  );
};

export const safeFailureDiagnostic = (error, releaseTag) => ({
  actual: error instanceof ContractIngestionError ? error.actual : undefined,
  attempts:
    error instanceof ContractIngestionError ? error.attempts : undefined,
  expected:
    error instanceof ContractIngestionError ? error.expected : undefined,
  message:
    error instanceof Error
      ? error.message
      : 'unknown contract ingestion failure',
  releaseTag,
  stage: error instanceof ContractIngestionError ? error.stage : 'unknown',
});
