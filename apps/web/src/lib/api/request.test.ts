import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, isApiError, toApiError } from './errors';
import { buildQuery, configureApi, request, CSRF_HEADER, CSRF_VALUE } from './request';

const problemBody = (status: number, code: string, extra: object = {}) => ({ type: 'about:blank', status, code, title: code, ...extra });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' } });

describe('api client core', () => {
  const onUnauthenticated = vi.fn();
  const onMfaRequired = vi.fn();
  const fetchMock = vi.fn<typeof fetch>();
  let restore: () => void;

  beforeEach(() => {
    fetchMock.mockReset();
    onUnauthenticated.mockReset();
    onMfaRequired.mockReset();
    restore = configureApi({ fetch: fetchMock, onUnauthenticated, onMfaRequired });
  });
  afterEach(() => restore());

  it('sends the CSRF header and cookies, and parses the response with the schema', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    const out = await request('/auth/session', { schema: z.object({ ok: z.boolean() }) });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/session');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe(CSRF_VALUE);
  });

  it('sends JSON bodies with a content type', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await request('/x', { method: 'POST', body: { a: 1 } });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(request('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('maps problem+json to a typed ApiError with field errors', async () => {
    fetchMock.mockResolvedValue(
      json(422, problemBody(422, 'RULE_BELOW_FLOOR', { errors: [{ path: 'practiceMonths', code: 'BELOW_FLOOR', params: { floor: 12, value: 6 } }] })),
    );
    const err = await request('/rule-sets/baseline/draft', { method: 'PUT' }).catch((e: unknown) => e);
    expect(isApiError(err)).toBe(true);
    const e = err as ApiError;
    expect(e.status).toBe(422);
    expect(e.code).toBe('RULE_BELOW_FLOOR');
    expect(e.errors).toHaveLength(1);
    expect(e.fieldErrors().practiceMonths?.params).toEqual({ floor: 12, value: 6 });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('never exposes the server detail text as the user-facing code', async () => {
    fetchMock.mockResolvedValue(json(400, problemBody(400, 'VALIDATION_FAILED', { detail: 'ZodError: secret internals' })));
    const e = (await request('/x').catch((x: unknown) => x)) as ApiError;
    expect(e.code).toBe('VALIDATION_FAILED');
  });

  it('redirects to sign-in on 401 UNAUTHENTICATED', async () => {
    fetchMock.mockResolvedValue(json(401, problemBody(401, 'UNAUTHENTICATED')));
    await expect(request('/candidates')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('does not treat a wrong one-time code (also 401) as a signed-out session', async () => {
    fetchMock.mockResolvedValue(json(401, problemBody(401, 'OTP_INVALID')));
    await expect(request('/auth/otp/verify', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('skips the redirect when asked (public and second-factor calls)', async () => {
    fetchMock.mockResolvedValue(json(401, problemBody(401, 'UNAUTHENTICATED')));
    await expect(request('/auth/session', { skipAuthRedirect: true })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('redirects to the second step on 403 MFA_REQUIRED, but not on a plain 403', async () => {
    fetchMock.mockResolvedValueOnce(json(403, problemBody(403, 'MFA_REQUIRED')));
    await expect(request('/queue')).rejects.toMatchObject({ code: 'MFA_REQUIRED' });
    expect(onMfaRequired).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValueOnce(json(403, problemBody(403, 'FORBIDDEN')));
    await expect(request('/queue')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(onMfaRequired).toHaveBeenCalledOnce();
  });

  it('turns a network failure into NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('reports RESPONSE_INVALID when the body does not match the contract', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: 'yes' }));
    await expect(request('/x', { schema: z.object({ ok: z.boolean() }) })).rejects.toMatchObject({ code: 'RESPONSE_INVALID' });
  });

  it('reports RESPONSE_INVALID when a success body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(request('/x')).rejects.toMatchObject({ code: 'RESPONSE_INVALID' });
  });

  it('maps a bare proxy error (no problem body) by status', () => {
    expect(toApiError(502, '<html>').code).toBe('UNKNOWN');
    expect(toApiError(404, null).code).toBe('NOT_FOUND');
    expect(toApiError(413, null).code).toBe('FILE_TOO_LARGE');
  });
});

describe('buildQuery', () => {
  it('skips empty values and encodes the rest', () => {
    expect(buildQuery({ q: 'a b', stage: '', page: 2, none: undefined, nul: null, flag: false })).toBe('?q=a+b&page=2&flag=false');
    expect(buildQuery({})).toBe('');
    expect(buildQuery()).toBe('');
  });
});
