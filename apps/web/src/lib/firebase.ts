/**
 * Firebase client (.claude/rules/auth-security.md: only VITE_-prefixed values reach
 * the browser, and every one of them is public by design). `initializeApp` never
 * throws even with blank/wrong values, but `getAuth()` validates the key against
 * Firebase eagerly and throws synchronously if it's missing or rejected — so that call
 * is deferred to first use (via getFirebaseAuth()) instead of running at module load.
 * An import-time throw here would crash before React ever mounts, leaving a blank
 * page with no on-screen indication of why; callers instead catch it and show a
 * message (see useAuth.tsx).
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}
