/**
 * Deterministic domain service for the commitments umbrella
 * (.claude/rules/data-model.md § commitments). No AI, no raw SQL — validated args in,
 * repository calls out. TASK/REMINDER get their own thin wrappers
 * (domain/tasks, domain/reminders); PAYMENT status lives on financial_instances, never
 * here, so this service never touches PAYMENT-type rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import type {
  CommitmentPriority,
  CommitmentRecord,
  CommitmentStatus,
  CommitmentType,
  CommitmentView,
} from '../../types/commitment';
import type { IntentArgs } from '../../types/intents';
import { localDateString } from '../finance/period';
import {
  classifyDueDate,
  computeFireDate,
  nextOccurrence,
  parseRecurrenceRule,
} from './recurrence';

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

/** 'YYYY-MM-DD' today in the user's timezone — the as-of instant every view uses. */
export function today(now: Date, timezone: string): string {
  return localDateString(now, timezone);
}

/**
 * The presentation shape: the stored row plus the dates that are always derived, never
 * persisted (.claude/rules/finance-rules.md § Determinism — a stored "next occurrence"
 * or "is overdue" goes stale the moment the day rolls over).
 *
 * `nextOccurrence` is where a recurring important date earns its keep: a birthday
 * anchored at 1990-02-29 reports the right day every year, clamped in non-leap years.
 */
export function toView(record: CommitmentRecord, today: string): CommitmentView {
  const rule = parseRecurrenceRule(record.recurrenceRule);
  const next = record.dueDate ? nextOccurrence(record.dueDate, rule, today) : null;
  const effectiveDate = next ?? record.dueDate;

  return {
    ...record,
    recurrence: rule,
    nextOccurrence: next,
    fireDate: effectiveDate ? computeFireDate(effectiveDate, record.leadDays) : null,
    urgency: record.status === 'pending' ? classifyDueDate(effectiveDate, today) : null,
  };
}

export function toViews(records: CommitmentRecord[], today: string): CommitmentView[] {
  return records.map((record) => toView(record, today));
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

export interface CreateCommitmentInput {
  type: CommitmentType;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  recurrenceRule?: string | null;
  leadDays?: number | null;
  priority?: CommitmentPriority;
}

/**
 * The REST entry point. PAYMENT is refused here on purpose: a payment commitment only
 * ever exists alongside a financial_obligation, so creating one directly would leave an
 * obligation-less PAYMENT row that no finance calculation can see
 * (.claude/rules/finance-rules.md: "An instance is never created without an obligation").
 * Payments are created through the finance service instead.
 */
export async function create(
  client: SupabaseClient,
  userId: string,
  input: CreateCommitmentInput,
): Promise<CommitmentRecord> {
  if (input.type === 'PAYMENT') {
    throw new Error('PAYMENT commitments are created through the finance service.');
  }

  return commitmentsRepository.createCommitment(client, {
    userId,
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    dueTime: input.dueTime ?? null,
    recurrenceRule: input.recurrenceRule ?? null,
    leadDays: input.leadDays ?? null,
    priority: input.priority ?? 'normal',
    source: 'manual',
  });
}

export interface ListParams {
  type?: CommitmentType;
  status?: CommitmentStatus;
  dueBefore?: string;
  dueFrom?: string;
  limit?: number;
}

export async function list(
  client: SupabaseClient,
  userId: string,
  params: ListParams,
  now: Date,
  timezone: string,
): Promise<CommitmentView[]> {
  const records = await commitmentsRepository.listCommitments(client, { userId, ...params });
  return toViews(records, localDateString(now, timezone));
}

export async function getById(
  client: SupabaseClient,
  userId: string,
  id: string,
  now: Date,
  timezone: string,
): Promise<CommitmentView | null> {
  const record = await commitmentsRepository.getCommitmentById(client, userId, id);
  return record ? toView(record, localDateString(now, timezone)) : null;
}

export interface UpdateInput {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: CommitmentPriority;
  status?: CommitmentStatus;
  leadDays?: number | null;
  recurrenceRule?: string | null;
}

export async function update(
  client: SupabaseClient,
  userId: string,
  id: string,
  input: UpdateInput,
  now: Date,
  timezone: string,
): Promise<CommitmentView | null> {
  const updated = await commitmentsRepository.updateCommitment(client, userId, id, input);
  return updated ? toView(updated, localDateString(now, timezone)) : null;
}

/** Cancels rather than deletes — see cancelCommitment in the repository for why. */
export async function cancel(
  client: SupabaseClient,
  userId: string,
  id: string,
  now: Date,
  timezone: string,
): Promise<CommitmentView | null> {
  const cancelled = await commitmentsRepository.cancelCommitment(client, userId, id);
  return cancelled ? toView(cancelled, localDateString(now, timezone)) : null;
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
