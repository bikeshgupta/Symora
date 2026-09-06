/**
 * The two substitutions the API integration tests make, in one place so each test file
 * declares them in three lines. TEST-ONLY.
 *
 * Firebase: the real `verifyBearerToken` still runs — header extraction, the bearer
 * scheme check, and the mapping of a rejected token to UNAUTHENTICATED are all the
 * shipping code. Only the Admin SDK's network call is replaced, by a stub that accepts
 * `test:<firebase uid>` and rejects everything else.
 *
 * Supabase: `getSupabaseServiceClient` returns the in-memory fake for the duration of a
 * test. Repositories, domain services, handlers and routing are untouched.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const TEST_TOKEN_PREFIX = 'test:';

let activeClient: SupabaseClient | null = null;

export function useClient(client: SupabaseClient): void {
  activeClient = client;
}

export function clearClient(): void {
  activeClient = null;
}

function requireClient(): SupabaseClient {
  if (!activeClient) {
    throw new Error('No fake Supabase client is installed. Call useClient() in beforeEach.');
  }
  return activeClient;
}

/**
 * Firebase Admin needs credentials before it will initialize. Real values are never
 * used — the stub below replaces the only call that would consume them — but the
 * initialization path is the shipping one, so it has to be satisfied.
 */
export function installFirebaseTestCredentials(): void {
  process.env.FIREBASE_PROJECT_ID = 'symora-test';
  process.env.FIREBASE_CLIENT_EMAIL = 'test@symora-test.iam.gserviceaccount.com';
  process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n';
}

export const firebaseAppModule = {
  cert: () => ({}),
  getApps: () => [],
  initializeApp: () => ({ name: 'symora-test' }),
};

export const firebaseAuthModule = {
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (!token.startsWith(TEST_TOKEN_PREFIX)) {
        throw new Error('Firebase ID token has invalid signature.');
      }
      const uid = token.slice(TEST_TOKEN_PREFIX.length);
      // The email deliberately does not embed the uid: a test asserting that an export
      // contains no firebase uid would otherwise pass or fail on the email alone.
      const localPart = uid.replace(/^firebase-/, '');
      return { uid, email: `${localPart}@example.com`, name: localPart };
    },
  }),
};

export function coreModule(actual: Record<string, unknown>): Record<string, unknown> {
  return { ...actual, getSupabaseServiceClient: requireClient };
}
