/**
 * Firebase Admin verification (.claude/rules/auth-security.md § Identity). Lazily
 * initialized so importing this module doesn't crash a build that has no Firebase
 * secrets yet; it only throws when a request actually needs verification.
 */

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { ApiError } from './errors';

let app: App | null = null;

function getFirebaseAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set ' +
        'to verify a request.',
    );
  }

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      // .env stores the key with literal \n escapes; restore real newlines.
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    }),
  });
  return app;
}

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new ApiError('UNAUTHENTICATED', 'Missing or malformed Authorization header.');
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new ApiError('UNAUTHENTICATED', 'Missing bearer token.');
  }
  return token;
}

/**
 * Verifies the request's Firebase ID token. Throws ApiError('UNAUTHENTICATED', ...) for
 * a missing, malformed, or invalid/expired token — never falls back to an anonymous or
 * default user (.claude/rules/auth-security.md).
 */
export async function verifyBearerToken(
  authorizationHeader: string | undefined,
): Promise<DecodedIdToken> {
  const token = extractBearerToken(authorizationHeader);
  try {
    return await getAuth(getFirebaseAdminApp()).verifyIdToken(token);
  } catch {
    throw new ApiError('UNAUTHENTICATED', 'Invalid or expired session. Please sign in again.');
  }
}
