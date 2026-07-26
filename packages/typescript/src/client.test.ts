import { describe, expect, it } from 'vitest';

import { createMessijoClient } from './client.js';
import { MessijoApiError } from './errors.js';

const jsonResponse = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', ...init.headers },
    ...init,
  });

describe('createMessijoClient', () => {
  it('uses the production default and attaches the API key to list requests', async () => {
    let capturedRequest: Request | undefined;
    const mockFetch: typeof fetch = async (input) => {
      capturedRequest = input instanceof Request ? input : new Request(input);
      return jsonResponse({ keywords: [] });
    };
    const client = createMessijoClient({
      apiKey: 'test-api-key',
      fetch: mockFetch,
    });

    await client.listKeywords({ path: { org_id: 'org id' } });

    expect(capturedRequest?.method).toBe('GET');
    expect(capturedRequest?.url).toBe(
      'https://api.messijo.com/api/orgs/org%20id/keywords',
    );
    expect(capturedRequest?.headers.get('X-API-Key')).toBe('test-api-key');
    expect(capturedRequest?.headers.get('Authorization')).toBeNull();
  });

  it('uses base URL and transport overrides for create requests', async () => {
    let capturedRequest: Request | undefined;
    const mockFetch: typeof fetch = async (input) => {
      capturedRequest = input instanceof Request ? input : new Request(input);
      return jsonResponse({ id: 'keyword-id' });
    };
    const client = createMessijoClient({
      apiKey: 'override-key',
      baseUrl: 'https://example.test',
      fetch: mockFetch,
    });

    await client.createKeyword({
      body: {
        ignored_users: [],
        is_whole_word: true,
        parts: [{ is_whole_word: true, value: 'messijo' }],
        platforms: ['hackernews'],
        type: 'compound',
        value: 'messijo',
      },
      path: { org_id: 'org-id' },
    });

    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.url).toBe(
      'https://example.test/api/orgs/org-id/keywords',
    );
    expect(await capturedRequest?.json()).toMatchObject({
      is_whole_word: true,
      platforms: ['hackernews'],
    });
  });

  it('throws a useful redacted error for JSON API failures', async () => {
    const client = createMessijoClient({
      apiKey: 'must-not-leak',
      baseUrl: 'https://example.test',
      fetch: async () =>
        jsonResponse(
          { error: 'invalid keyword' },
          {
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'request-id',
            },
            status: 422,
          },
        ),
    });

    const error = await client
      .createKeyword({
        body: {
          ignored_users: [],
          is_whole_word: true,
          parts: [{ is_whole_word: true, value: 'messijo' }],
          platforms: ['hackernews'],
          type: 'compound',
          value: 'messijo',
        },
        path: { org_id: 'org-id' },
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MessijoApiError);
    expect(error).toMatchObject({
      data: { error: 'invalid keyword' },
      status: 422,
    });
    expect((error as MessijoApiError).headers.get('x-request-id')).toBe(
      'request-id',
    );
    expect((error as MessijoApiError).request).toEqual({
      method: 'POST',
      url: 'https://example.test/api/orgs/org-id/keywords',
    });
    expect(JSON.stringify(error)).not.toContain('must-not-leak');
  });

  it('retains the original transport failure as its cause', async () => {
    const transportFailure = new Error('connection reset');
    const client = createMessijoClient({
      apiKey: 'test-api-key',
      fetch: async () => {
        throw transportFailure;
      },
    });

    const error = await client
      .listKeywords({ path: { org_id: 'org-id' } })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(MessijoApiError);
    expect((error as MessijoApiError).status).toBeUndefined();
    expect((error as MessijoApiError).cause).toBe(transportFailure);
  });
});
