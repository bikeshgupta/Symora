/**
 * The one API error contract (.claude/rules/auth-security.md § Errors and logging):
 * a stable machine-readable code, a safe message, and a request id. Every /api/*
 * response is either a success envelope or this error envelope — never a bare payload.
 */

export interface ApiErrorPayload {
  code: string;
  message: string;
  requestId: string;
}

export interface ApiErrorBody {
  error: ApiErrorPayload;
}

export interface ApiSuccessBody<T> {
  data: T;
}

export type ApiResponseBody<T> = ApiSuccessBody<T> | ApiErrorBody;

export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'object'
  );
}
