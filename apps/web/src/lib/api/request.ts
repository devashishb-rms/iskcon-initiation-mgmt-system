import type { ZodType, ZodTypeDef } from 'zod';

type Schema<T> = ZodType<T, ZodTypeDef, unknown>;
import { ApiError, toApiError } from './errors';

export const CSRF_HEADER = 'x-requested-by';
export const CSRF_VALUE = 'iskcon-web';

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  /** JSON body. */
  body?: unknown;
  /** multipart body (uploads). Do not set a content type; the browser adds the boundary. */
  form?: FormData;
  /** Every response is parsed with this schema when one exists in `@iskcon/contracts`. */
  schema?: Schema<T>;
  /** For public calls where a 401 means "wrong code", not "signed out". */
  skipAuthRedirect?: boolean;
  signal?: AbortSignal;
}

export interface ApiRuntime {
  base: string;
  fetch: typeof fetch;
  onUnauthenticated: () => void;
  onMfaRequired: () => void;
}

const browserRedirect = (path: string) => () => {
  if (typeof window !== 'undefined' && window.location.pathname !== path) window.location.assign(path);
};

let runtime: ApiRuntime = {
  base: '/api',
  fetch: (...args) => fetch(...args),
  onUnauthenticated: browserRedirect('/login'),
  onMfaRequired: browserRedirect('/mfa'),
};

/** Replace parts of the runtime (tests, or a different proxy path). Returns a function that restores it. */
export function configureApi(patch: Partial<ApiRuntime>): () => void {
  const previous = runtime;
  runtime = { ...runtime, ...patch };
  return () => {
    runtime = previous;
  };
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const apiUrl = (path: string, query?: Query): string => `${runtime.base}${path}${buildQuery(query)}`;

async function send(path: string, opts: RequestOptions<unknown>): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { [CSRF_HEADER]: CSRF_VALUE, accept: 'application/json, application/problem+json, */*' };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await runtime.fetch(apiUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR' });
  }
  if (res.ok) return res;

  let parsedBody: unknown = null;
  try {
    parsedBody = await res.json();
  } catch {
    parsedBody = null;
  }
  const err = toApiError(res.status, parsedBody);
  if (!opts.skipAuthRedirect) {
    // OTP_INVALID is also a 401, but it means "wrong code", never "signed out": only UNAUTHENTICATED redirects.
    if (err.status === 401 && err.code === 'UNAUTHENTICATED') runtime.onUnauthenticated();
    else if (err.status === 403 && err.code === 'MFA_REQUIRED') runtime.onMfaRequired();
  }
  throw err;
}

function parse<T>(json: unknown, schema: RequestOptions<T>['schema']): T {
  if (!schema) return json as T;
  const r = schema.safeParse(json);
  if (!r.success) throw new ApiError({ status: 200, code: 'RESPONSE_INVALID', detail: r.error.message });
  return r.data;
}

/** The single core every API module goes through. */
export async function request<T = void>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError({ status: res.status, code: 'RESPONSE_INVALID' });
  }
  return parse(json, opts.schema);
}

/** Like `request`, but also returns the response headers (e.g. `X-Unread-Count`). */
export async function requestWithHeaders<T>(path: string, opts: RequestOptions<T> = {}): Promise<{ data: T; headers: Headers }> {
  const res = await send(path, opts);
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
  return { data: parse(json, opts.schema), headers: res.headers };
}

export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

/** For POST endpoints that answer with a file (the candidate package). */
export async function requestFile(path: string, opts: RequestOptions<never> = {}): Promise<DownloadedFile> {
  const res = await send(path, opts);
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob, filename: match?.[1] ? decodeURIComponent(match[1]) : 'download' };
}

/** Saves a blob through a temporary link (no navigation, so the session cookie flow is untouched). */
export function saveBlob(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
