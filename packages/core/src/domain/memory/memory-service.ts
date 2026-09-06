/**
 * The memory domain service (.claude/rules/data-model.md § memories,
 * .claude/rules/ai-pipeline.md § Memory in the pipeline).
 *
 * Two rules shape everything here:
 *
 * 1. Memory is explicit and editable (CLAUDE.md principle 7). Rows are written only via
 *    the `remember_preference` intent or an explicit user edit — never as a silent side
 *    effect of another intent. No other domain service writes to `memories`.
 * 2. Superseding preserves history: the old row's window is closed and a new row is
 *    inserted, so "what did Symora believe in March?" stays answerable.
 *
 * Every function takes `now`/`timezone` explicitly and derives dates through
 * domain/finance/period.ts, so date logic resolves in the user's timezone and stays
 * reproducible (.claude/rules/finance-rules.md § Timezone).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as auditRepository from '../../repositories/audit-repository';
import * as memoriesRepository from '../../repositories/memories-repository';
import {
  readMemoryText,
  type MemoryRecord,
  type MemorySource,
  type MemoryType,
  type MemoryView,
} from '../../types/memory';
import type { IntentArgs, IntentName } from '../../types/intents';
import { localDateString } from '../finance/period';
import { decideSupersede, isCurrentAsOf } from './effective-dates';
import { selectRelevantMemories, DEFAULT_MEMORY_LIMIT, type ScorableMemory } from './relevance';

export { decideSupersede, isCurrentAsOf, isSuperseded } from './effective-dates';
export { selectRelevantMemories, scoreMemory, tokenize } from './relevance';

/** 'YYYY-MM-DD' today in the user's timezone — the instant every date check uses. */
export function asOfDate(now: Date, timezone: string): string {
  return localDateString(now, timezone);
}

export function toView(record: MemoryRecord, asOf: string): MemoryView {
  return {
    id: record.id,
    memoryType: record.memoryType,
    key: record.key,
    text: readMemoryText(record.valueJson),
    source: record.source,
    confidence: record.confidence,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    isCurrent: isCurrentAsOf(record, asOf),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Keys are matched exactly on lookup, so they are normalized once on the way in. */
export function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

export type RememberOutcome = 'created' | 'superseded' | 'unchanged';

export interface RememberResult {
  outcome: RememberOutcome;
  memory: MemoryRecord;
  /** The row that was closed, when this statement corrected an earlier one. */
  supersededMemory: MemoryRecord | null;
}

/**
 * Record an explicitly stated memory, superseding whatever was current for that key.
 *
 * Restating the same value is an `unchanged` no-op rather than a second identical row:
 * repeating yourself is not a correction, and the extra row would make the history
 * claim the fact changed when it did not.
 *
 * The close-then-insert pair is not wrapped in a transaction — the Supabase JS client
 * has no multi-statement transaction, and adding a Postgres function for it is Phase 9
 * hardening work. The failure mode is bounded and safe: if the insert fails after the
 * close, the key is left with no current row, so the next statement simply inserts. The
 * partial unique index from migration 0007 is what prevents two current rows, not this
 * ordering.
 */
export async function remember(
  client: SupabaseClient,
  userId: string,
  params: {
    memoryType: MemoryType;
    key: string;
    text: string;
    source?: MemorySource;
    confidence?: number;
  },
  now: Date,
  timezone: string,
): Promise<RememberResult> {
  const today = localDateString(now, timezone);
  const key = normalizeKey(params.key);
  const text = params.text.trim();

  const current = await memoriesRepository.findCurrentByKey(client, userId, params.memoryType, key);
  const decision = decideSupersede(
    current ? { text: readMemoryText(current.valueJson), effectiveFrom: current.effectiveFrom } : null,
    text,
    today,
  );

  if (decision.action === 'noop') {
    return { outcome: 'unchanged', memory: current!, supersededMemory: null };
  }

  let supersededMemory: MemoryRecord | null = null;
  if (decision.action === 'supersede') {
    supersededMemory = await memoriesRepository.supersedeMemory(
      client,
      userId,
      current!.id,
      decision.effectiveTo,
    );
  }

  const memory = await memoriesRepository.createMemory(client, {
    userId,
    memoryType: params.memoryType,
    key,
    valueJson: { text },
    // A statement that replaces an earlier one is recorded as a correction, which is
    // what makes "you corrected this" visible in the memory list.
    source: params.source ?? (supersededMemory ? 'corrected' : 'user_stated'),
    effectiveFrom: today,
    confidence: params.confidence,
  });

  return {
    outcome: supersededMemory ? 'superseded' : 'created',
    memory,
    supersededMemory,
  };
}

/** The `remember_preference` intent's entry point — preferences, facts and aliases. */
export async function rememberPreference(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'remember_preference'>,
  now: Date,
  timezone: string,
): Promise<RememberResult> {
  return remember(
    client,
    userId,
    { memoryType: args.memoryType, key: args.key, text: args.value },
    now,
    timezone,
  );
}

export interface ListMemoriesOptions {
  includeSuperseded?: boolean;
  memoryType?: MemoryType;
}

/** Backs "What Symora knows about me". */
export async function listMemories(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
  options: ListMemoriesOptions = {},
): Promise<MemoryView[]> {
  const asOf = localDateString(now, timezone);
  const records = await memoriesRepository.listMemories(client, userId, {
    includeSuperseded: options.includeSuperseded,
    memoryType: options.memoryType,
    asOf,
  });
  return records.map((record) => toView(record, asOf));
}

export async function getMemory(
  client: SupabaseClient,
  userId: string,
  id: string,
  now: Date,
  timezone: string,
): Promise<MemoryView | null> {
  const record = await memoriesRepository.getMemoryById(client, userId, id);
  return record ? toView(record, localDateString(now, timezone)) : null;
}

/**
 * An explicit user edit. Unlike `remember`, this corrects a row in place rather than
 * superseding it — the user is fixing what Symora wrote down, not stating that the
 * world changed, so no new history entry is warranted.
 */
export async function editMemory(
  client: SupabaseClient,
  userId: string,
  id: string,
  params: { text?: string; key?: string },
  now: Date,
  timezone: string,
): Promise<MemoryView | null> {
  const existing = await memoriesRepository.getMemoryById(client, userId, id);
  if (!existing) return null;

  const updated = await memoriesRepository.updateMemory(client, userId, id, {
    valueJson: params.text === undefined ? undefined : { text: params.text.trim() },
    key: params.key === undefined ? undefined : normalizeKey(params.key),
    source: 'corrected',
  });

  return updated ? toView(updated, localDateString(now, timezone)) : null;
}

/**
 * Hard delete, per the privacy commitment that a user can delete any memory.
 *
 * Unlike superseding, this leaves no history: the user asked for the fact to be gone,
 * and a "deleted" row that still held the value would make a lie of that. What is
 * recorded instead is an audit event naming the row — never its content
 * (.claude/rules/auth-security.md § Privacy commitments, and migration 0010's comment on
 * what an audit row may carry).
 */
export async function deleteMemory(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await memoriesRepository.deleteMemory(client, userId, id);
  if (!deleted) return false;

  await auditRepository.recordAuditEvent(client, {
    userId,
    action: 'memory_deleted',
    targetTable: 'memories',
    targetId: id,
  });
  return true;
}

export interface RelevantMemory extends ScorableMemory {
  id: string;
  effectiveFrom: string;
}

/**
 * Load the memories worth putting in front of the model for this turn.
 *
 * Only rows in effect as of today in the user's timezone are considered — a superseded
 * fact must never influence a new answer (.claude/rules/ai-pipeline.md: "Retrieved
 * memory respects effective_from / effective_to; superseded facts are not used").
 * Ranking is deterministic and AI-free; see relevance.ts.
 */
export async function retrieveRelevant(
  client: SupabaseClient,
  userId: string,
  params: { text: string; intent?: IntentName | null; limit?: number },
  now: Date,
  timezone: string,
): Promise<RelevantMemory[]> {
  const asOf = localDateString(now, timezone);
  const records = await memoriesRepository.listMemories(client, userId, { asOf });

  const candidates: RelevantMemory[] = records
    .filter((record) => isCurrentAsOf(record, asOf))
    .map((record) => ({
      id: record.id,
      memoryType: record.memoryType,
      key: record.key,
      text: readMemoryText(record.valueJson),
      effectiveFrom: record.effectiveFrom,
    }))
    .filter((memory) => memory.text.length > 0);

  return selectRelevantMemories({
    memories: candidates,
    text: params.text,
    intent: params.intent,
    limit: params.limit ?? DEFAULT_MEMORY_LIMIT,
  });
}
