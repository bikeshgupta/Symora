/**
 * The only module that queries `public.memories`. Phase 2 only inserts (via
 * remember_preference) — retrieval/superseding is Phase 3.
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
    })
    .select()
    .single<MemoryRow>();

  if (error || !data) {
    throw new Error(`Failed to create memory: ${error?.message ?? 'unknown error'}`);
  }
  return toRecord(data);
}
