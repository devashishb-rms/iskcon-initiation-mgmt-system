import type { ErrorCode } from '@iskcon/contracts';

export type ErrorParams = Record<string, string | number>;
export interface FieldError {
  path: string;
  code: string;
  message?: string;
  params?: ErrorParams;
}

/**
 * Base class for every error the application raises on purpose. The HTTP layer turns it into an
 * RFC 9457 problem body. `code` is stable (clients translate it); `message` is for logs only.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message?: string,
    readonly params?: ErrorParams,
    readonly errors?: FieldError[],
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

export class ValidationFailed extends AppError {
  constructor(errors: FieldError[]) {
    super('VALIDATION_FAILED', 400, 'Request validation failed', undefined, errors);
  }
}
export class Unauthenticated extends AppError {
  constructor(message = 'Sign in required') {
    super('UNAUTHENTICATED', 401, message);
  }
}
export class MfaRequired extends AppError {
  constructor() {
    super('MFA_REQUIRED', 403, 'A second factor is required for this role');
  }
}
export class Forbidden extends AppError {
  constructor(message = 'You are not allowed to do that') {
    super('FORBIDDEN', 403, message);
  }
}
export class NotFound extends AppError {
  constructor(what = 'Resource') {
    super('NOT_FOUND', 404, `${what} not found`);
  }
}
export class Conflict extends AppError {
  constructor(code: ErrorCode = 'CONFLICT', message?: string, params?: ErrorParams) {
    super(code, 409, message, params);
  }
}
/** A business rule refused the action. 422: the request was well-formed but not allowed in this state. */
export class RuleViolation extends AppError {
  constructor(code: ErrorCode, message?: string, params?: ErrorParams, errors?: FieldError[]) {
    super(code, 422, message, params, errors);
  }
}
export class RateLimited extends AppError {
  constructor() {
    super('RATE_LIMITED', 429, 'Too many attempts');
  }
}
