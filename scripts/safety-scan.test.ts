import { describe, expect, it } from 'vitest';

import { scanText } from './lib/safety-scan.mjs';

describe('public-surface safety scan', () => {
  it('accepts representative public API material', () => {
    expect(
      scanText(
        '{"servers":[{"url":"https://api.messijo.com"}],"secret_key":{"type":"string"}}',
      ),
    ).toEqual([]);
  });

  it('reports rule identifiers without returning matched secrets', () => {
    const realisticSecret = `sk_live_${'a'.repeat(24)}`;
    const findings = scanText(`example credential = "${realisticSecret}"`);

    expect(findings).toContain('live-provider-key');
    expect(JSON.stringify(findings)).not.toContain(realisticSecret);
  });

  it('rejects private surfaces and implementation extensions', () => {
    expect(scanText('"url":"http://localhost:4000/api/internal/jobs"')).toEqual(
      expect.arrayContaining(['private-url', 'implementation-route']),
    );
    expect(scanText('{"x-struct":"Private.Schema"}')).toContain(
      'implementation-extension',
    );
  });
});
