/**
 * Phase 9 — token verification at the boundary.
 *
 * These cover the two halves separately from the integration suite: what counts as a
 * well-formed Authorization header, and what a failure is reported as. The second half
 * matters more than it looks — a server misconfiguration told to the user as "please
 * sign in again" sends them round a loop that signing in can never fix.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();

vi.mock('firebase-admin/app', async () => (await import('../_testing/stubs')).firebaseAppModule);
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));

import { ApiError } from './errors';
import { verifyBearerToken } from './firebase-admin';
import { installFirebaseTestCredentials } from '../_testing/stubs';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  verifyIdToken.mockReset();
  installFirebaseTestCredentials();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function codeOf(header: string | undefined): Promise<string> {
  try {
    await verifyBearerToken(header);
    return 'no-error';
  } catch (err) {
    return err instanceof ApiError ? err.code : 'not-an-api-error';
  }
}

describe('verifyBearerToken — header handling', () => {
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
    ['no scheme', 'test:abc'],
    ['the wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['a bearer with no token', 'Bearer '],
    ['a bearer with only whitespace', 'Bearer    '],
    ['the wrong case', 'bearer test:abc'],
  ])('rejects %s without ever calling Firebase', async (_label, header) => {
    expect(await codeOf(header as string | undefined)).toBe('UNAUTHENTICATED');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('passes a well-formed token through to Firebase and returns the decoded identity', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'a@example.com' });
    const decoded = await verifyBearerToken('Bearer good-token');

    expect(verifyIdToken).toHaveBeenCalledWith('good-token');
    expect(decoded.uid).toBe('uid-1');
  });
});

describe('verifyBearerToken — failure reporting', () => {
  it('reports a rejected token as UNAUTHENTICATED without leaking the reason', async () => {
    verifyIdToken.mockRejectedValue(new Error('Firebase ID token has invalid signature; kid=abc123'));

    await expect(verifyBearerToken('Bearer forged')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(verifyBearerToken('Bearer forged')).rejects.not.toMatchObject({
      message: expect.stringContaining('kid='),
    });
  });

  it('keeps the underlying reason on `cause` so the server log still has it', async () => {
    verifyIdToken.mockRejectedValue(new Error('token expired at 2026-09-06T00:00:00Z'));

    const error = await verifyBearerToken('Bearer expired').catch((err: unknown) => err as ApiError);
    expect((error.cause as Error).message).toContain('token expired');
  });

  it('reports missing Firebase credentials as a server error, not as a bad session', async () => {
    // Telling a user to sign in again cannot fix an unset FIREBASE_PRIVATE_KEY, and a
    // 401 hides a deployment fault behind what looks like ordinary user error.
    //
    // Re-imported so the module's cached App from the tests above is discarded and
    // initialization actually runs against the stripped environment.
    vi.resetModules();
    delete process.env.FIREBASE_PRIVATE_KEY;
    const fresh = await import('./firebase-admin');

    const error = await fresh
      .verifyBearerToken('Bearer anything')
      .catch((err: unknown) => err as ApiError);
    // Not `toBeInstanceOf`: resetModules gave this import its own copy of errors.ts,
    // so the class identity differs even though the value is an ApiError.
    expect(error.name).toBe('ApiError');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.status).toBe(500);
    expect(error.message).not.toMatch(/FIREBASE_/);
    expect(String((error.cause as Error).message)).toContain('FIREBASE_PRIVATE_KEY');
  });
});
