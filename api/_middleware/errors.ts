/**
 * The one API error contract (.claude/rules/auth-security.md § Errors and logging).
 * Every thrown error that reaches withApiHandler's catch is normalized to this shape.
 * Internal details (stack traces, driver error text) never leave the server.
 */

import type { ApiErrorBody } from '@symora/core';

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function toErrorBody(error: ApiError, requestId: string): ApiErrorBody {
  return { error: { code: error.code, message: error.message, requestId } };
}

/** Normalizes any thrown value into an ApiError, without leaking internal detail. */
export function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
