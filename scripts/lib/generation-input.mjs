import path from 'node:path';

const URI_SCHEME = /^[a-z][a-z\d+.-]*:/iu;

export const resolveOpenApiInput = (repositoryRoot, configuredInput) => {
  if (URI_SCHEME.test(configuredInput)) {
    throw new Error('OpenAPI input must be a repository-local file path');
  }

  const input = path.resolve(repositoryRoot, configuredInput);
  if (!input.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error('OpenAPI input must remain inside this repository');
  }
  return input;
};
