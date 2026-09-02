/**
 * Fetch wrapper for /api/*. Attaches the caller's Firebase ID token and parses the one
 * error contract (.claude/rules/auth-security.md § Errors and logging).
 */

import { firebaseAuth } from './firebase';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.requestId = requestId;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const idToken = await firebaseAuth.currentUser?.getIdToken();
  if (!idToken) {
    throw new ApiRequestError('UNAUTHENTICATED', 'You are signed out.', 'client');
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  const body = (await response.json()) as { data: T } | { error: { code: string; message: string; requestId: string } };

  if (!response.ok || 'error' in body) {
    const error = 'error' in body ? body.error : { code: 'INTERNAL_ERROR', message: 'Request failed.', requestId: 'unknown' };
    throw new ApiRequestError(error.code, error.message, error.requestId);
  }

  return body.data;
}
