// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { createMessijoClient } from './client.js';

describe('browser-like Fetch environment', () => {
  it('uses standards-based web globals without Node transport APIs', async () => {
    expect(globalThis.window).toBeDefined();
    expect(globalThis.Headers).toBeTypeOf('function');
    expect(globalThis.Request).toBeTypeOf('function');
    expect(globalThis.Response).toBeTypeOf('function');
    expect(globalThis.AbortController).toBeTypeOf('function');
    expect(globalThis.ReadableStream).toBeTypeOf('function');

    let capturedRequest: Request | undefined;
    const client = createMessijoClient({
      apiKey: 'test-key',
      fetch: async (input) => {
        capturedRequest = input instanceof Request ? input : new Request(input);
        return new Response(JSON.stringify({ keywords: [] }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await client.listKeywords({ path: { org_id: 'browser-org' } });

    expect(capturedRequest?.headers.get('X-API-Key')).toBe('test-key');
    expect(capturedRequest?.url).toBe(
      'https://api.messijo.com/api/orgs/browser-org/keywords',
    );
  });
});
