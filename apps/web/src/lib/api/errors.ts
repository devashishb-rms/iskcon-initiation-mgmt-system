import { problem, type Problem } from '@iskcon/contracts';

export interface ApiFieldError {
  path: string;
  code: string;
  message?: string;
  params?: Record<string, string | number>;
}

/** Codes the browser raises itself (the API never sends them). */
export type ClientErrorCode = 'NETWORK_ERROR' | 'RESPONSE_INVALID' | 'UNKNOWN';

/**
 * A failed API call. `code` is stable and translated by the UI (`error.<code>`); the server's
 * free-text `detail` is kept only for debugging and is never shown to people.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly params: Record<string, string | number> | undefined;
  readonly errors: ApiFieldError[];
  readonly requestId: string | undefined;

  constructor(init: {
    status: number;
    code: string;
    params?: Record<string, string | number> | undefined;
    errors?: ApiFieldError[] | undefined;
    requestId?: string | undefined;
    detail?: string | undefined;
  }) {
    super(init.detail ?? init.code);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.params = init.params;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId;
  }

  /** Field errors keyed by path, for inline display next to the right input. */
  fieldErrors(): Record<string, ApiFieldError> {
    const out: Record<string, ApiFieldError> = {};
    for (const e of this.errors) if (!(e.path in out)) out[e.path] = e;
    return out;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Turns an RFC 9457 body (or whatever a proxy answered) into an ApiError. */
export function toApiError(status: number, body: unknown): ApiError {
  const parsed = problem.safeParse(body);
  if (parsed.success) return fromProblem(parsed.data);
  const code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : status === 413 ? 'FILE_TOO_LARGE' : 'UNKNOWN';
  return new ApiError({ status, code });
}

function fromProblem(p: Problem): ApiError {
  return new ApiError({
    status: p.status,
    code: p.code,
    params: p.params,
    errors: p.errors,
    requestId: p.requestId,
    detail: p.detail,
  });
}
