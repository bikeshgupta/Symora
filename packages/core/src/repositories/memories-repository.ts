/**
 * The only module that queries `public.memories`. Every function takes `userId`
 * explicitly and filters on it — the service-role client bypasses RLS, so this filter
 * is the real access boundary (.claude/rules/auth-security.md).
 *
 * Nothing here decides *whether* to supersede, edit or delete; that is the domain
 * service's job. This layer only issues the queries.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryRecord, MemorySource, MemoryType } from '../types/memory';

interface MemoryRow {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  key: string;
  value_json: unknown;
  source: MemorySource;
  confidence: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, user_id, memory_type, key, value_json, source, confidence, effective_from, effective_to, created_at, updated_at';

function toRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    memoryType: row.memory_type,
    key: row.key,
    valueJson: row.value_json,
    source: row.source,
    confidence: row.confidence,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateMemoryParams {
  userId: string;
  memoryType: MemoryType;
  key: string;
  valueJson: unknown;
  source: MemorySource;
  effectiveFrom: string;
  confidence?: number;
}

export async function createMemory(
  client: SupabaseClient,
  params: CreateMemoryParams,
): Promise<MemoryRecord> {
  const { data, error } = await client
    .from('memories')
    .insert({
      user_id: params.userId,
      memory_type: params.memoryType,
      key: params.key,
      value_json: params.valueJson,
      source: params.source,
      effective_from: params.effectiveFrom,
      ...(params.confidence === undefined ? {} : { confidence: params.confidence }),
    })
    .select(COLUMNS)
    .single<MemoryRow>();

  if (error || !data) {
    throw new Error(`Failed to create memory: ${error?.message ?? 'unknown error'}`);
  }
  return toRecord(data);
}

/** A row that exists but belongs to another user returns null, never that row. */
export async function getMemoryById(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<MemoryRecord | null> {
  const { data, error } = await client
    .from('memories')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<MemoryRow>();

  if (error) throw new Error(`Failed to load memory ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}

/**
 * The current row for a key, if any. Relies on migration 0007's partial unique index
 * over (user_id, memory_type, key) where effective_to is null, so at most one row can
 * come back.
 */
export async function findCurrentByKey(
  client: SupabaseClient,
  userId: string,
  memoryType: MemoryType,
  key: string,
): Promise<MemoryRecord | null> {
  const { data, error } = await client
    .from('memories')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('memory_type', memoryType)
    .eq('key', key)
    .is('effective_to', null)
    .maybeSingle<MemoryRow>();

  if (error) throw new Error(`Failed to look up memory '${key}': ${error.message}`);
  return data ? toRecord(data) : null;
}

export interface ListMemoriesParams {
  /** Include rows already superseded. Defaults to false — only what is in effect. */
  includeSuperseded?: boolean;
  memoryType?: MemoryType;
  /** 'YYYY-MM-DD' in the user's timezone; required unless includeSuperseded is set. */
  asOf?: string;
}

export async function listMemories(
  client: SupabaseClient,
  userId: string,
  params: ListMemoriesParams = {},
): Promise<MemoryRecord[]> {
  let query = client.from('memories').select(COLUMNS).eq('user_id', userId);

  if (!params.includeSuperseded && params.asOf) {
    // In effect as of that date: started on or before it, not yet ended (exclusive end).
    query = query.lte('effective_from', params.asOf).or(`effective_to.is.null,effective_to.gt.${params.asOf}`);
  } else if (!params.includeSuperseded) {
    query = query.is('effective_to', null);
  }

  if (params.memoryType) query = query.eq('memory_type', params.memoryType);

  const { data, error } = await query
    .order('memory_type', { ascending: true })
    .order('key', { ascending: true })
    .order('effective_from', { ascending: false })
    .returns<MemoryRow[]>();

  if (error) throw new Error(`Failed to list memories: ${error.message}`);
  return (data ?? []).map(toRecord);
}

/**
 * Closes a memory's window. Guarded on `effective_to is null` so a concurrent second
 * supersede cannot re-close an already-closed row and lose the first end date; the
 * caller sees null and can re-read.
 */
export async function supersedeMemory(
  client: SupabaseClient,
  userId: string,
  id: string,
  effectiveTo: string,
): Promise<MemoryRecord | null> {
  const { data, error } = await client
    .from('memories')
    .update({ effective_to: effectiveTo })
    .eq('id', id)
    .eq('user_id', userId)
    .is('effective_to', null)
    .select(COLUMNS)
    .maybeSingle<MemoryRow>();

  if (error) throw new Error(`Failed to supersede memory ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}

export interface UpdateMemoryParams {
  valueJson?: unknown;
  key?: string;
  effectiveTo?: string | null;
  source?: MemorySource;
}

/** An in-place edit of the user's own row — used by the explicit "edit memory" action. */
export async function updateMemory(
  client: SupabaseClient,
  userId: string,
  id: string,
  params: UpdateMemoryParams,
): Promise<MemoryRecord | null> {
  const patch: Record<string, unknown> = {};
  if (params.valueJson !== undefined) patch.value_json = params.valueJson;
  if (params.key !== undefined) patch.key = params.key;
  if (params.effectiveTo !== undefined) patch.effective_to = params.effectiveTo;
  if (params.source !== undefined) patch.source = params.source;

  if (Object.keys(patch).length === 0) return getMemoryById(client, userId, id);

  const { data, error } = await client
    .from('memories')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle<MemoryRow>();

  if (error) throw new Error(`Failed to update memory ${id}: ${error.message}`);
  return data ? toRecord(data) : null;
}

/** Returns false when nothing was deleted — a missing row or another user's row. */
export async function deleteMemory(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('memories')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Failed to delete memory ${id}: ${error.message}`);
  return data !== null;
}
