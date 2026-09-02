/**
 * Phase 2 slice of the memory domain service: a plain, explicit write
 * (.claude/rules/data-model.md § memories, .claude/rules/ai-pipeline.md § Memory in the
 * pipeline: "Write to memories only via the remember_preference intent... never as a
 * silent side effect"). Retrieval, aliases, corrections and superseding are Phase 3.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as memoriesRepository from '../../repositories/memories-repository';
import type { MemoryRecord } from '../../types/memory';
import type { IntentArgs } from '../../types/intents';
import { localDateString } from '../finance/period';

export async function rememberPreference(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'remember_preference'>,
  now: Date,
  timezone: string,
): Promise<MemoryRecord> {
  return memoriesRepository.createMemory(client, {
    userId,
    memoryType: args.memoryType,
    key: args.key,
    valueJson: { text: args.value },
    source: 'user_stated',
    effectiveFrom: localDateString(now, timezone),
  });
}
