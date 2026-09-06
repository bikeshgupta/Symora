/**
 * Fixtures for the Phase 9 suite. TEST-ONLY.
 *
 * Two users, always. Nearly every rule in .claude/rules/auth-security.md is about what
 * user A cannot see of user B, and a fixture with one user cannot catch a missing
 * `.eq('user_id', ...)` — the query returns the caller's own rows either way.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase, FakeDatabase, type FakeSupabaseClient } from './fake-supabase';
import type { UserRecord } from '../types/user';

export interface TestUser {
  record: UserRecord;
  firebaseUid: string;
}

export interface TestWorld {
  db: FakeDatabase;
  fake: FakeSupabaseClient;
  /** The same object, typed as the driver so it can be handed to a repository. */
  client: SupabaseClient;
  alice: TestUser;
  bob: TestUser;
}

function toUserRecord(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    firebaseUid: String(row.firebase_uid),
    email: row.email === null ? null : String(row.email),
    displayName: row.display_name === null ? null : String(row.display_name),
    timezone: String(row.timezone),
    preferredLanguage: row.preferred_language as UserRecord['preferredLanguage'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface SeedUserOptions {
  firebaseUid: string;
  email?: string;
  displayName?: string;
  timezone?: string;
  preferredLanguage?: UserRecord['preferredLanguage'];
}

export function seedUser(db: FakeDatabase, options: SeedUserOptions): TestUser {
  const row = db.applyDefaults('users', {
    firebase_uid: options.firebaseUid,
    // Deliberately not derived from the uid: a test asserting that an export carries no
    // firebase uid would otherwise pass or fail on the email address alone.
    email: options.email ?? `${options.firebaseUid.replace(/^firebase-/, '')}@example.com`,
    display_name: options.displayName ?? options.firebaseUid.replace(/^firebase-/, ''),
    ...(options.timezone ? { timezone: options.timezone } : {}),
    ...(options.preferredLanguage ? { preferred_language: options.preferredLanguage } : {}),
  });
  db.rows('users').push(row);
  return { record: toUserRecord(row), firebaseUid: options.firebaseUid };
}

/**
 * Alice and Bob both live in Asia/Kolkata by default, so a timezone bug cannot hide
 * behind a difference between them; the timezone tests vary it explicitly.
 */
export function createTestWorld(options: { timezone?: string } = {}): TestWorld {
  const db = new FakeDatabase();
  const fake = createFakeSupabase(db);
  const timezone = options.timezone ?? 'Asia/Kolkata';

  return {
    db,
    fake,
    client: fake as unknown as SupabaseClient,
    alice: seedUser(db, { firebaseUid: 'firebase-alice', timezone }),
    bob: seedUser(db, { firebaseUid: 'firebase-bob', timezone }),
  };
}
