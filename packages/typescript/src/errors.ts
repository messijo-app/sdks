const REDACTED = '[REDACTED]';
const SENSITIVE_QUERY_PARAMETER =
  /^(?:api[_-]?key|authorization|password|secret|token|x-api-key)$/iu;

const redactRequestUrl = (requestUrl: string): string => {
  try {
    const url = new URL(requestUrl);
    if (url.username) {
      url.username = REDACTED;
    }
    if (url.password) {
      url.password = REDACTED;
    }
    for (const name of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_PARAMETER.test(name)) {
        url.searchParams.set(name, REDACTED);
      }
    }
    return url.toString();
  } catch {
    return '<unavailable>';
  }
};

export interface MessijoRequestMetadata {
  readonly method?: string;
  readonly url?: string;
}

export interface MessijoApiErrorOptions {
  readonly cause?: unknown;
  readonly data?: unknown;
  readonly request?: Request;
  readonly response?: Response;
}

export class MessijoApiError extends Error {
  readonly data: unknown;
  readonly headers: Headers;
  readonly request: MessijoRequestMetadata;
  readonly status: number | undefined;

  constructor(options: MessijoApiErrorOptions) {
    const { cause, data, request, response } = options;
    const message = response
      ? `Messijo API request failed with status ${response.status}`
      : 'Messijo API transport failed';
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MessijoApiError';
    this.status = response?.status;
    this.headers = new Headers(response?.headers);
    this.data = data;
    this.request = {
      method: request?.method,
      url: request ? redactRequestUrl(request.url) : undefined,
    };
  }
}
