/**
 * Tasks are commitments with type 'TASK' (.claude/rules/data-model.md). This is a thin
 * wrapper, not a parallel implementation — mark_done/reschedule reuse
 * domain/commitments directly since a task is resolved and mutated exactly like any
 * other non-payment commitment.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import type { CommitmentPriority, CommitmentRecord, CommitmentView } from '../../types/commitment';
import type { IntentArgs } from '../../types/intents';
import * as commitmentsService from '../commitments/commitments-service';

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

export interface CreateTaskInput {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: CommitmentPriority;
  description?: string | null;
}

/** The REST entry point; the chat path above goes through createTask. */
export async function create(
  client: SupabaseClient,
  userId: string,
  input: CreateTaskInput,
): Promise<CommitmentRecord> {
  return commitmentsService.create(client, userId, { ...input, type: 'TASK' });
}

export async function list(
  client: SupabaseClient,
  userId: string,
  params: { status?: 'pending' | 'done' | 'cancelled'; dueBefore?: string },
  now: Date,
  timezone: string,
): Promise<CommitmentView[]> {
  return commitmentsService.list(client, userId, { ...params, type: 'TASK' }, now, timezone);
}
