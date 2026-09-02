/**
 * Deterministic domain service for the commitments umbrella
 * (.claude/rules/data-model.md § commitments). No AI, no raw SQL — validated args in,
 * repository calls out. TASK/REMINDER get their own thin wrappers
 * (domain/tasks, domain/reminders); PAYMENT status lives on financial_instances, never
 * here, so this service never touches PAYMENT-type rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import type { CommitmentRecord, CommitmentType } from '../../types/commitment';
import type { IntentArgs } from '../../types/intents';

export type ResolveResult =
  | { status: 'ok'; commitment: CommitmentRecord }
  | { status: 'ambiguous'; candidates: CommitmentRecord[] }
  | { status: 'not_found' };

/** Resolves a mark_done/reschedule target by id (authoritative) or a title search. */
async function resolveTarget(
  client: SupabaseClient,
  userId: string,
  params: { commitmentId?: string; title?: string },
): Promise<ResolveResult> {
  if (params.commitmentId) {
    const commitment = await commitmentsRepository.getCommitmentById(client, userId, params.commitmentId);
    return commitment ? { status: 'ok', commitment } : { status: 'not_found' };
  }

  const candidates = await commitmentsRepository.findPendingByTitle(client, userId, params.title!);
  if (candidates.length === 0) return { status: 'not_found' };
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  return { status: 'ok', commitment: candidates[0]! };
}

export async function createImportantDate(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'create_commitment'>,
): Promise<CommitmentRecord> {
  return commitmentsRepository.createCommitment(client, {
    userId,
    type: 'IMPORTANT_DATE',
    title: args.title,
    description: args.description ?? null,
    dueDate: args.dueDate,
    recurrenceRule: args.recurrenceRule ?? null,
    source: 'chat',
  });
}

export interface ListPendingParams {
  type?: Exclude<CommitmentType, 'PAYMENT'>;
  dueBefore?: string;
}

export async function listPending(
  client: SupabaseClient,
  userId: string,
  params: ListPendingParams,
): Promise<CommitmentRecord[]> {
  return commitmentsRepository.listPendingCommitments(client, {
    userId,
    type: params.type,
    dueBefore: params.dueBefore,
  });
}

export async function markDone(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'mark_done'>,
): Promise<ResolveResult> {
  const resolved = await resolveTarget(client, userId, args);
  if (resolved.status !== 'ok') return resolved;

  const updated = await commitmentsRepository.markCommitmentDone(client, userId, resolved.commitment.id);
  return updated ? { status: 'ok', commitment: updated } : { status: 'not_found' };
}

export async function reschedule(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'reschedule'>,
): Promise<ResolveResult> {
  const resolved = await resolveTarget(client, userId, args);
  if (resolved.status !== 'ok') return resolved;

  const updated = await commitmentsRepository.rescheduleCommitment(
    client,
    userId,
    resolved.commitment.id,
    args.newDueDate,
    args.newDueTime ?? null,
  );
  return updated ? { status: 'ok', commitment: updated } : { status: 'not_found' };
}
