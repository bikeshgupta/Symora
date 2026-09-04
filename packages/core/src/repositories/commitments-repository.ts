/**
 * The only module that queries `public.commitments`. Every function takes `userId`
 * explicitly and filters on it — the service-role client bypasses RLS, so this filter
 * is the real access boundary (.claude/rules/auth-security.md).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommitmentPriority,
  CommitmentRecord,
  CommitmentSource,
  CommitmentStatus,
  CommitmentType,
} from '../types/commitment';

interface CommitmentRow {
  id: string;
  user_id: string;
  type: CommitmentType;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  recurrence_rule: string | null;
  lead_days: number | null;
  status: 'pending' | 'done' | 'cancelled';
  priority: CommitmentPriority;
  source: CommitmentSource;
  created_at: string;
  updated_at: string;
}

function toRecord(row: CommitmentRow): CommitmentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    dueTime: row.due_time,
    recurrenceRule: row.recurrence_rule,
    leadDays: row.lead_days,
    status: row.status,
    priority: row.priority,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateCommitmentParams {
  userId: string;
  type: CommitmentType;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrenceRule?: string | null;
  leadDays?: number | null;
  priority?: CommitmentPriority;
  source: CommitmentSource;
}

export async function createCommitment(
  client: SupabaseClient,
  params: CreateCommitmentParams,
): Promise<CommitmentRecord> {
  const { data, error } = await client
    .from('commitments')
    .insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      description: params.description ?? null,
      due_date: params.dueDate ?? null,
      due_time: params.dueTime ?? null,
      recurrence_rule: params.recurrenceRule ?? null,
      lead_days: params.leadDays ?? null,
      priority: params.priority ?? 'normal',
      source: params.source,
    })
    .select()
    .single<CommitmentRow>();

  if (error || !data) {
    throw new Error(`Failed to create commitment: ${error?.message ?? 'unknown error'}`);
  }
  return toRecord(data);
}

/** A row that exists but belongs to another user returns null, never that row. */
export async function getCommitmentById(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<CommitmentRecord | null> {
  const { data, error } = await client
    .from('commitments')
    .select()
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<CommitmentRow>();

  if (error) throw new Error(`Failed to load commitment ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}

/** Best-effort title match among the user's pending commitments, most recent first. */
export async function findPendingByTitle(
  client: SupabaseClient,
  userId: string,
  title: string,
  type?: CommitmentType,
): Promise<CommitmentRecord[]> {
  let query = client
    .from('commitments')
    .select()
    .eq('user_id', userId)
    .eq('status', 'pending')
    .ilike('title', `%${title}%`)
    .order('created_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query.returns<CommitmentRow[]>();
  if (error) throw new Error(`Failed to search commitments: ${error.message}`);
  return (data ?? []).map(toRecord);
}

export interface ListPendingParams {
  userId: string;
  type?: CommitmentType;
  dueBefore?: string;
}

export async function listPendingCommitments(
  client: SupabaseClient,
  params: ListPendingParams,
): Promise<CommitmentRecord[]> {
  return listCommitments(client, { ...params, status: 'pending' });
}

export interface ListCommitmentsParams {
  userId: string;
  type?: CommitmentType;
  status?: CommitmentStatus;
  dueBefore?: string;
  dueFrom?: string;
  limit?: number;
}

export async function listCommitments(
  client: SupabaseClient,
  params: ListCommitmentsParams,
): Promise<CommitmentRecord[]> {
  let query = client
    .from('commitments')
    .select()
    .eq('user_id', params.userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (params.type) query = query.eq('type', params.type);
  if (params.status) query = query.eq('status', params.status);
  if (params.dueBefore) query = query.lte('due_date', params.dueBefore);
  if (params.dueFrom) query = query.gte('due_date', params.dueFrom);
  if (params.limit) query = query.limit(params.limit);

  const { data, error } = await query.returns<CommitmentRow[]>();
  if (error) throw new Error(`Failed to list commitments: ${error.message}`);
  return (data ?? []).map(toRecord);
}

export interface UpdateCommitmentParams {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: CommitmentPriority;
  status?: CommitmentStatus;
  leadDays?: number | null;
  recurrenceRule?: string | null;
}

export async function updateCommitment(
  client: SupabaseClient,
  userId: string,
  id: string,
  params: UpdateCommitmentParams,
): Promise<CommitmentRecord | null> {
  const patch: Record<string, unknown> = {};
  if (params.title !== undefined) patch.title = params.title;
  if (params.description !== undefined) patch.description = params.description;
  if (params.dueDate !== undefined) patch.due_date = params.dueDate;
  if (params.dueTime !== undefined) patch.due_time = params.dueTime;
  if (params.priority !== undefined) patch.priority = params.priority;
  if (params.status !== undefined) patch.status = params.status;
  if (params.leadDays !== undefined) patch.lead_days = params.leadDays;
  if (params.recurrenceRule !== undefined) patch.recurrence_rule = params.recurrenceRule;

  if (Object.keys(patch).length === 0) return getCommitmentById(client, userId, id);

  const { data, error } = await client
    .from('commitments')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle<CommitmentRow>();

  if (error) throw new Error(`Failed to update commitment ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}

/**
 * Cancelling rather than deleting: a commitment the user backed out of is history, and
 * a PAYMENT commitment owns financial_instances that must survive it
 * (.claude/rules/finance-rules.md: "Deleting or ending an obligation must not delete
 * its historical instances").
 */
export async function cancelCommitment(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<CommitmentRecord | null> {
  return updateCommitment(client, userId, id, { status: 'cancelled' });
}

/** Idempotent: marking an already-done commitment done again is a no-op success. */
export async function markCommitmentDone(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<CommitmentRecord | null> {
  const { data, error } = await client
    .from('commitments')
    .update({ status: 'done' })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle<CommitmentRow>();

  if (error) throw new Error(`Failed to mark commitment ${id} done: ${error.message}`);
  return data ? toRecord(data) : null;
}

export async function rescheduleCommitment(
  client: SupabaseClient,
  userId: string,
  id: string,
  newDueDate: string,
  newDueTime?: string | null,
): Promise<CommitmentRecord | null> {
  const { data, error } = await client
    .from('commitments')
    .update({ due_date: newDueDate, due_time: newDueTime ?? null })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle<CommitmentRow>();

  if (error) throw new Error(`Failed to reschedule commitment ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}
