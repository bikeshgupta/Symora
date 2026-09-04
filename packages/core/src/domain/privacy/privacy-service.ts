/**
 * Data export and account deletion (PROGRESS.md Phase 8, and the privacy commitments in
 * .claude/rules/auth-security.md: "The user can view every memory, delete any memory,
 * export their data, and delete their account. Account deletion removes user-owned rows
 * across every table").
 *
 * Both operations are scoped to the caller's own `user_id`, which comes from the
 * verified token. Neither accepts an id from the request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  commitmentsRepository,
  conversationsRepository,
  financialRepository,
  memoriesRepository,
  notificationsRepository,
} from '../../repositories';
import type { UserRecord } from '../../types/user';

export interface DataExport {
  exportedAt: string;
  /** What Symora holds, stated plainly at the top of the file the user downloads. */
  notice: string;
  profile: Omit<UserRecord, 'firebaseUid'>;
  memories: unknown[];
  commitments: unknown[];
  financialObligations: unknown[];
  financialInstances: unknown[];
  conversations: unknown[];
  messages: unknown[];
  notifications: unknown[];
}

const EXPORT_NOTICE =
  'This is everything Symora holds about you. Symora only knows what you intentionally ' +
  'told, typed, pasted or shared with it — it does not read your SMS or collect anything ' +
  'on its own.';

/**
 * The user's whole dataset as one JSON document.
 *
 * `firebase_uid` is deliberately omitted: it is an internal join key to the auth
 * provider, not information about the user, and echoing it back serves no one.
 */
export async function exportData(
  client: SupabaseClient,
  user: UserRecord,
  now: Date,
): Promise<DataExport> {
  const [memories, commitments, obligations, conversations, messages, notifications] = await Promise.all([
    memoriesRepository.listMemories(client, user.id, { includeSuperseded: true }),
    commitmentsRepository.listCommitments(client, { userId: user.id }),
    financialRepository.listObligations(client, user.id),
    conversationsRepository.listConversations(client, user.id),
    conversationsRepository.listAllMessages(client, user.id),
    notificationsRepository.listNotifications(client, user.id, { includeDismissed: true, limit: 1000 }),
  ]);

  // Instances are fetched per obligation because that is the only access path the
  // repository offers; the count is bounded by obligations × months, which stays small.
  const instances = (
    await Promise.all(
      obligations.map((obligation) =>
        financialRepository.listInstancesForObligation(client, user.id, obligation.id),
      ),
    )
  ).flat();

  return {
    exportedAt: now.toISOString(),
    notice: EXPORT_NOTICE,
    // Listed field by field rather than spread-minus-one, so adding a column to `users`
    // is a deliberate decision about whether it belongs in an export.
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    memories,
    commitments,
    financialObligations: obligations,
    financialInstances: instances,
    conversations,
    messages,
    notifications,
  };
}

export interface DeletionResult {
  deletedUserId: string;
  deletedAt: string;
}

/**
 * Deletes the user's row, which cascades to every user-owned table.
 *
 * Every table's `user_id` is declared `references public.users (id) on delete cascade`,
 * so one delete removes commitments, obligations, instances, memories, conversations,
 * messages, usage events and notifications together. Doing it in one statement rather
 * than table by table is what makes it atomic — a partial deletion would leave orphaned
 * personal data behind, which is the one outcome this must never produce.
 *
 * The Firebase auth user is *not* deleted here: that is a separate system, and the
 * caller is responsible for it. Left undone, the next sign-in would provision a fresh
 * empty `users` row rather than resurrecting the old data.
 */
export async function deleteAccount(
  client: SupabaseClient,
  userId: string,
  now: Date,
): Promise<DeletionResult> {
  const { error } = await client.from('users').delete().eq('id', userId);
  if (error) throw new Error(`Failed to delete account: ${error.message}`);

  return { deletedUserId: userId, deletedAt: now.toISOString() };
}
