/**
 * Canonical shape of a `users` row (.claude/rules/data-model.md § users), as returned
 * by the repository layer to the rest of the app. camelCase at every layer above SQL.
 */

export type PreferredLanguage = 'en' | 'hi' | 'hinglish';

export interface UserRecord {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  timezone: string;
  preferredLanguage: PreferredLanguage;
  createdAt: string;
  updatedAt: string;
}
