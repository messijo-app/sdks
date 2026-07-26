import {
  createClient as createGeneratedClient,
  type Client as GeneratedClient,
} from './generated/client/index.js';
import * as generatedOperations from './generated/sdk.gen.js';
import { MessijoApiError } from './errors.js';

export const MESSIJO_PRODUCTION_BASE_URL = 'https://api.messijo.com';

export interface CreateMessijoClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
}

type BindOperation<T> = T extends (options: infer Options) => infer Result
  ? (options: Omit<Options, 'client'>) => Result
  : never;

type BoundOperations = {
  [Name in keyof typeof generatedOperations]: BindOperation<
    (typeof generatedOperations)[Name]
  >;
};

export type MessijoClient = GeneratedClient & BoundOperations;

export const createMessijoClient = ({
  apiKey,
  baseUrl = MESSIJO_PRODUCTION_BASE_URL,
  fetch: fetchOverride,
}: CreateMessijoClientOptions): MessijoClient => {
  if (!apiKey) {
    throw new TypeError('apiKey must be a non-empty string');
  }

  const client = createGeneratedClient({
    auth: (auth) =>
      auth.type === 'apiKey' && auth.name === 'X-API-Key' ? apiKey : undefined,
    baseUrl,
    fetch: fetchOverride,
    responseStyle: 'fields',
    throwOnError: true,
  });

  client.interceptors.error.use((error, response, request) => {
    if (error instanceof MessijoApiError) {
      return error;
    }
    return new MessijoApiError({
      cause: response ? undefined : error,
      data: response ? error : undefined,
      request,
      response,
    });
  });

  const boundClient = client as MessijoClient;
  for (const [name, operation] of Object.entries(generatedOperations)) {
    const bindableOperation = operation as (
      options: Record<string, unknown>,
    ) => unknown;
    Object.defineProperty(boundClient, name, {
      configurable: false,
      enumerable: true,
      value: (options: object) => bindableOperation({ ...options, client }),
      writable: false,
    });
  }
  return boundClient;
};
