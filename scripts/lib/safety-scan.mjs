import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const safetyRules = [
  {
    id: 'private-url',
    pattern:
      /\bhttps?:\/\/(?:localhost(?=[:/])|127(?:\.\d{1,3}){3}(?=[:/])|10(?:\.\d{1,3}){3}(?=[:/])|192\.168(?:\.\d{1,3}){2}(?=[:/])|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}(?=[:/])|[a-z\d.-]+\.(?:internal|local)(?=[:/]))/iu,
  },
  {
    id: 'implementation-route',
    pattern: /\/(?:api\/)?(?:admin|debug|internal|private)(?:\/|["'`])/iu,
  },
  {
    id: 'implementation-extension',
    pattern: /"(?:x-internal|x-struct|x-validate)"\s*:/iu,
  },
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u,
  },
  {
    id: 'github-token',
    pattern: /\bgh[pousr]_[a-z\d]{20,}\b/iu,
  },
  {
    id: 'aws-access-key',
    pattern: /\bAKIA[A-Z\d]{16}\b/u,
  },
  {
    id: 'live-provider-key',
    pattern: /\b(?:rk|sk)_live_[a-z\d]{16,}\b/iu,
  },
  {
    id: 'bearer-credential',
    pattern: /\bBearer\s+[a-z\d._~+/-]{20,}\b/iu,
  },
  {
    id: 'credential-assignment',
    pattern:
      /\b(?:api[_-]?key|password|secret|token)\b\s*[:=]\s*["'][a-z\d+/=_-]{16,}["']/iu,
  },
  {
    id: 'forbidden-internal-term',
    pattern:
      /\b(?:implementation-only|messijo[_-]?(?:dev|staging)|todo-internal)\b/iu,
  },
];

export const scanText = (text) =>
  safetyRules.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);

const ignoredDirectoryNames = new Set(['.git', 'coverage', 'node_modules']);

export const collectFiles = async (inputPath) => {
  const inputStat = await stat(inputPath);
  if (inputStat.isFile()) {
    return [inputPath];
  }
  if (!inputStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(inputPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          !entry.isDirectory() || !ignoredDirectoryNames.has(entry.name),
      )
      .map((entry) => collectFiles(path.join(inputPath, entry.name))),
  );
  return nested.flat();
};

export const scanPaths = async (inputPaths) => {
  const findings = [];
  for (const inputPath of inputPaths) {
    for (const file of await collectFiles(inputPath)) {
      const content = await readFile(file, 'utf8');
      for (const ruleId of scanText(content)) {
        findings.push({ file, ruleId });
      }
    }
  }
  return findings;
};
