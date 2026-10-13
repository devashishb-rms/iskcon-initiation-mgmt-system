import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_VERSION, commitImportBody } from '@iskcon/contracts';
import { importsApi } from './imports';
import { configureApi } from './request';

describe('imports api', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let restore: () => void;
  beforeEach(() => {
    fetchMock.mockReset();
    restore = configureApi({ fetch: fetchMock, onUnauthenticated: vi.fn(), onMfaRequired: vi.fn() });
  });
  afterEach(() => restore());

  it('commits with the consent the server requires (the body must satisfy the contract)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ created: 2, skipped: 1, skippedRows: [{ line: 4, code: 'import.email.invalid' }] }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const result = await importsApi.commit('abc');
    expect(result.created).toBe(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/imports/abc/commit');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(commitImportBody.safeParse(body).success).toBe(true);
    expect(body.consent.version).toBe(CONSENT_VERSION);
  });
});
