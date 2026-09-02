/**
 * The only module that queries `public.users` (.claude/rules/data-model.md § users).
 * `user_id` is never accepted from a caller here — the only lookup key is a Firebase
 * uid that has already been verified by Firebase Admin. See
 * .claude/rules/auth-security.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreferredLanguage, UserRecord } from '../types/user';

interface UserRow {
  id: string;
  firebase_uid: string;
  email: string | null;
  display_name: string | null;
  timezone: string;
  preferred_language: PreferredLanguage;
  created_at: string;
  updated_at: string;
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    preferredLanguage: row.preferred_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GetOrCreateUserParams {
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Idempotent: keyed on the unique `firebase_uid` constraint. Provisioning a user who
 * already exists updates only `email`/`display_name` (kept fresh from the verified
 * token) and never resets `timezone`/`preferred_language`, which the user may have
 * changed since.
 */
export async function getOrCreateUserByFirebaseUid(
  client: SupabaseClient,
  params: GetOrCreateUserParams,
): Promise<UserRecord> {
  const { data, error } = await client
    .from('users')
    .upsert(
      { firebase_uid: params.firebaseUid, email: params.email, display_name: params.displayName },
      { onConflict: 'firebase_uid' },
    )
    .select()
    .single<UserRow>();

  if (error || !data) {
    throw new Error(`Failed to get or create user: ${error?.message ?? 'unknown error'}`);
  }

  return toUserRecord(data);
}

export async function getUserById(
  client: SupabaseClient,
  userId: string,
): Promise<UserRecord | null> {
  const { data, error } = await client
    .from('users')
    .select()
    .eq('id', userId)
    .maybeSingle<UserRow>();

  if (error) {
    throw new Error(`Failed to load user ${userId}: ${error.message}`);
  }

  return data ? toUserRecord(data) : null;
}
