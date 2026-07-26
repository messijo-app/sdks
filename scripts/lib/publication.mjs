import { compareSemVer, recommendSdkBump } from './release-processing.mjs';
import { ContractIngestionError, parseSemVer } from './contract-ingestion.mjs';

const releaseMetadataKeys = [
  'api_version',
  'backend_source_commit',
  'breaking_changes',
  'changelog',
  'generator',
  'openapi_sha256',
  'schema_version',
  'sdk_commit',
  'sdk_version',
].sort();
const bumpRecordKeys = [
  'api_version',
  'backend_source_commit',
  'change_kind',
  'generator',
  'recommendation',
  'release_tag',
  'schema_version',
  'spec_sha256',
].sort();

export const validateBumpRecord = (bump) => {
  if (!bump || typeof bump !== 'object' || Array.isArray(bump)) {
    throw new ContractIngestionError(
      'bump-record',
      'reviewed bump record must be an object',
    );
  }
  const keys = Object.keys(bump).sort();
  if (
    keys.length !== bumpRecordKeys.length ||
    keys.some((key, index) => key !== bumpRecordKeys[index])
  ) {
    throw new ContractIngestionError(
      'bump-record',
      'reviewed bump record keys are invalid',
    );
  }
  parseSemVer(bump.api_version);
  if (
    bump.schema_version !== 1 ||
    bump.release_tag !== `api-v${bump.api_version}` ||
    !/^[0-9a-f]{40}$/u.test(bump.backend_source_commit) ||
    !/^[0-9a-f]{64}$/u.test(bump.spec_sha256) ||
    bump.generator !== '@hey-api/openapi-ts@0.99.0' ||
    bump.recommendation !== recommendSdkBump(bump.change_kind)
  ) {
    throw new ContractIngestionError(
      'bump-record',
      'reviewed bump record provenance is invalid',
    );
  }
  return Object.freeze({ ...bump });
};

export const validateReleaseMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new ContractIngestionError(
      'release-metadata',
      'release metadata must be an object',
    );
  }
  const keys = Object.keys(metadata).sort();
  if (
    keys.length !== releaseMetadataKeys.length ||
    keys.some((key, index) => key !== releaseMetadataKeys[index])
  ) {
    throw new ContractIngestionError(
      'release-metadata',
      'release metadata is incomplete or contains unknown fields',
    );
  }
  const sdkVersion = parseSemVer(metadata.sdk_version);
  parseSemVer(metadata.api_version);
  if (sdkVersion.major !== 0) {
    throw new ContractIngestionError(
      'release-metadata',
      'experimental SDK versions must remain on major zero',
    );
  }
  if (
    metadata.schema_version !== 1 ||
    !/^[0-9a-f]{40}$/u.test(metadata.backend_source_commit) ||
    !/^[0-9a-f]{40}$/u.test(metadata.sdk_commit) ||
    !/^[0-9a-f]{64}$/u.test(metadata.openapi_sha256) ||
    metadata.generator !== '@hey-api/openapi-ts@0.99.0' ||
    typeof metadata.changelog !== 'string' ||
    !Array.isArray(metadata.breaking_changes) ||
    metadata.breaking_changes.some(
      (entry) => typeof entry !== 'string' || entry.length === 0,
    )
  ) {
    throw new ContractIngestionError(
      'release-metadata',
      'release provenance fields are invalid',
    );
  }
  return Object.freeze({ ...metadata });
};

export const validateVersionBump = ({
  changeKind,
  currentVersion,
  nextVersion,
}) => {
  const current = parseSemVer(currentVersion);
  const next = parseSemVer(nextVersion);
  if (next.major !== 0 || compareSemVer(nextVersion, currentVersion) <= 0) {
    throw new ContractIngestionError(
      'release-version',
      'next SDK version must increase while remaining on 0.x',
    );
  }
  const recommendation = recommendSdkBump(changeKind);
  if (recommendation === 'minor' && next.minor <= current.minor) {
    throw new ContractIngestionError(
      'release-version',
      'the reviewed recommendation requires a minor SDK bump',
    );
  }
  return nextVersion;
};

export const validatePublicationContext = ({
  changelogText,
  eventName,
  fixture,
  metadata,
  packageAllowlistPassed,
  packageVersion,
  publicationEnabled,
  refProtected,
  tag,
  tagOnDefaultBranch,
  trustedPublisherConfigured,
}) => {
  if (!publicationEnabled) {
    throw new ContractIngestionError(
      'publication-policy',
      'SDK npm publication is disabled',
    );
  }
  if (eventName !== 'push') {
    throw new ContractIngestionError(
      'publication-policy',
      'publication requires a tag push',
    );
  }
  if (fixture) {
    throw new ContractIngestionError(
      'publication-policy',
      'bootstrap fixtures cannot authorize publication',
    );
  }
  if (!refProtected || !tagOnDefaultBranch) {
    throw new ContractIngestionError(
      'publication-policy',
      'tag must be protected and point to the default branch',
    );
  }
  if (!packageAllowlistPassed) {
    throw new ContractIngestionError(
      'publication-policy',
      'package content allowlist has not passed',
    );
  }
  if (!trustedPublisherConfigured) {
    throw new ContractIngestionError(
      'publication-policy',
      'npm trusted publisher is not configured',
    );
  }
  const validatedMetadata = validateReleaseMetadata(metadata);
  if (
    validatedMetadata.breaking_changes.length > 0 &&
    !changelogText.includes('**BREAKING:**')
  ) {
    throw new ContractIngestionError(
      'publication-policy',
      'approved breaking changes must be prominent in the changelog',
    );
  }
  const expectedTag = `sdk-typescript-v${packageVersion}`;
  if (tag !== expectedTag || validatedMetadata.sdk_version !== packageVersion) {
    throw new ContractIngestionError(
      'publication-policy',
      'tag, package version, and release metadata must match',
    );
  }
  return validatedMetadata;
};
