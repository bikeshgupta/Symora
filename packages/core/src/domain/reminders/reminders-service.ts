/**
 * Reminders are commitments with type 'REMINDER' (.claude/rules/data-model.md). Thin
 * wrapper — see domain/tasks/tasks-service.ts for the same pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import type { CommitmentRecord } from '../../types/commitment';
import type { IntentArgs } from '../../types/intents';

export async function createReminder(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'create_reminder'>,
): Promise<CommitmentRecord> {
  return commitmentsRepository.createCommitment(client, {
    userId,
    type: 'REMINDER',
    title: args.title,
    dueDate: args.dueDate ?? null,
    dueTime: args.dueTime ?? null,
    recurrenceRule: args.recurrenceRule ?? null,
    source: 'chat',
  });
}
