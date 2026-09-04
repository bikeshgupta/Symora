/**
 * Reminders are commitments with type 'REMINDER' (.claude/rules/data-model.md). Thin
 * wrapper — see domain/tasks/tasks-service.ts for the same pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import type { CommitmentRecord, CommitmentView } from '../../types/commitment';
import type { IntentArgs } from '../../types/intents';
import * as commitmentsService from '../commitments/commitments-service';

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
    leadDays: args.leadDays ?? null,
    source: 'chat',
  });
}

export interface CreateReminderInput {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrenceRule?: string | null;
  /** Days before the due date to surface it — "remind me 2 days before". */
  leadDays?: number | null;
}

export async function create(
  client: SupabaseClient,
  userId: string,
  input: CreateReminderInput,
): Promise<CommitmentRecord> {
  return commitmentsService.create(client, userId, { ...input, type: 'REMINDER' });
}

export async function list(
  client: SupabaseClient,
  userId: string,
  params: { status?: 'pending' | 'done' | 'cancelled' },
  now: Date,
  timezone: string,
): Promise<CommitmentView[]> {
  return commitmentsService.list(client, userId, { ...params, type: 'REMINDER' }, now, timezone);
}
