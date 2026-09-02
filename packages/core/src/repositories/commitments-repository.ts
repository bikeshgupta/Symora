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
  let query = client
    .from('commitments')
    .select()
    .eq('user_id', params.userId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true, nullsFirst: false });

  if (params.type) query = query.eq('type', params.type);
  if (params.dueBefore) query = query.lte('due_date', params.dueBefore);

  const { data, error } = await query.returns<CommitmentRow[]>();
  if (error) throw new Error(`Failed to list pending commitments: ${error.message}`);
  return (data ?? []).map(toRecord);
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
