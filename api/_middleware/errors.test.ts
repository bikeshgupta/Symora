import { describe, expect, it } from 'vitest';
import { ApiError, normalizeError, toErrorBody } from './errors';

describe('ApiError / normalizeError', () => {
  it('maps known codes to their HTTP status', () => {
    expect(new ApiError('UNAUTHENTICATED', 'nope').status).toBe(401);
    expect(new ApiError('NOT_FOUND', 'nope').status).toBe(404);
    expect(new ApiError('VALIDATION_ERROR', 'nope').status).toBe(422);
  });

  it('passes an ApiError through unchanged', () => {
    const err = new ApiError('FORBIDDEN', 'no access');
    expect(normalizeError(err)).toBe(err);
  });

  it('normalizes an unknown thrown value to a safe INTERNAL_ERROR, never leaking detail', () => {
    const normalized = normalizeError(new Error('leaked db connection string: postgres://...'));
    expect(normalized.code).toBe('INTERNAL_ERROR');
    expect(normalized.status).toBe(500);
    expect(normalized.message).not.toContain('postgres://');
  });

  it('builds the one error envelope shape', () => {
    const body = toErrorBody(new ApiError('NOT_FOUND', 'missing'), 'req-1');
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req-1' } });
  });
});
