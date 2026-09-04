/**
 * The only module that queries `public.notifications`. Every function takes `userId`
 * explicitly and filters on it (.claude/rules/auth-security.md).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationRecord, NotificationStatus, NotificationType } from '../types/notification';

interface NotificationRow {
  id: string;
  user_id: string;
  commitment_id: string | null;
  instance_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  scheduled_for: string;
  status: NotificationStatus;
  read_at: string | null;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    commitmentId: row.commitment_id,
    instanceId: row.instance_id,
    type: row.type,
    title: row.title,
    body: row.body,
    scheduledFor: row.scheduled_for,
    status: row.status,
    readAt: row.read_at,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertNotificationParams {
  userId: string;
  commitmentId: string | null;
  instanceId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  scheduledFor: string;
  dedupeKey: string;
}

/**
 * Idempotent insert. `ignoreDuplicates` leans on the unique (user_id, dedupe_key) index
 * rather than a pre-check, so two concurrent generations converge on one row instead of
 * racing (.claude/rules/finance-rules.md § Idempotency).
 *
 * An existing row is deliberately left untouched — re-running generation must never
 * resurrect something the user already dismissed.
 */
export async function upsertNotifications(
  client: SupabaseClient,
  params: UpsertNotificationParams[],
): Promise<number> {
  if (params.length === 0) return 0;

  const { data, error } = await client
    .from('notifications')
    .upsert(
      params.map((p) => ({
        user_id: p.userId,
        commitment_id: p.commitmentId,
        instance_id: p.instanceId,
        type: p.type,
        title: p.title,
        body: p.body,
        scheduled_for: p.scheduledFor,
        dedupe_key: p.dedupeKey,
      })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    )
    .select('id')
    .returns<{ id: string }[]>();

  if (error) throw new Error(`Failed to write notifications: ${error.message}`);
  return (data ?? []).length;
}

export interface ListNotificationsParams {
  status?: NotificationStatus;
  includeDismissed?: boolean;
  limit?: number;
}

export async function listNotifications(
  client: SupabaseClient,
  userId: string,
  params: ListNotificationsParams = {},
): Promise<NotificationRecord[]> {
  let query = client
    .from('notifications')
    .select()
    .eq('user_id', userId)
    .order('scheduled_for', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.status) query = query.eq('status', params.status);
  else if (!params.includeDismissed) query = query.neq('status', 'dismissed');

  const { data, error } = await query.returns<NotificationRow[]>();
  if (error) throw new Error(`Failed to list notifications: ${error.message}`);
  return (data ?? []).map(toRecord);
}

export async function countPending(client: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throw new Error(`Failed to count notifications: ${error.message}`);
  return count ?? 0;
}

export async function updateStatus(
  client: SupabaseClient,
  userId: string,
  id: string,
  status: NotificationStatus,
): Promise<NotificationRecord | null> {
  const { data, error } = await client
    .from('notifications')
    .update({ status, read_at: status === 'pending' ? null : new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle<NotificationRow>();

  if (error) throw new Error(`Failed to update notification ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}

export async function markAllRead(client: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await client
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id')
    .returns<{ id: string }[]>();

  if (error) throw new Error(`Failed to mark notifications read: ${error.message}`);
  return (data ?? []).length;
}
