/**
 * Tasks are commitments with type 'TASK' (.claude/rules/data-model.md). This is a thin
 * wrapper, not a parallel implementation — mark_done/reschedule reuse
 * domain/commitments directly since a task is resolved and mutated exactly like any
 * other non-payment commitment.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import type { CommitmentRecord } from '../../types/commitment';
import type { IntentArgs } from '../../types/intents';

export async function createTask(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'create_task'>,
): Promise<CommitmentRecord> {
  return commitmentsRepository.createCommitment(client, {
    userId,
    type: 'TASK',
    title: args.title,
    dueDate: args.dueDate ?? null,
    dueTime: args.dueTime ?? null,
    priority: args.priority ?? 'normal',
    source: 'chat',
  });
}
