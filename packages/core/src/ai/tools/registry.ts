/**
 * The typed tool registry (.claude/rules/ai-pipeline.md § Typed tool registry): "the
 * model's entire surface area. It cannot act outside it." Every entry pairs a Zod
 * args schema with a handler that validates and delegates straight to a domain
 * service — no tool holds business logic itself, and none accepts a user_id (that
 * comes from the verified request context, never the model).
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIProvider, AIToolDefinition } from '../../adapters/ai-provider';
import * as commitmentsService from '../../domain/commitments/commitments-service';
import * as tasksService from '../../domain/tasks/tasks-service';
import * as remindersService from '../../domain/reminders/reminders-service';
import * as financeService from '../../domain/finance/finance-service';
import * as memoryService from '../../domain/memory/memory-service';
import { draftMessage, type DraftMessageResult } from '../../domain/drafting/draft-service';
import { draftMessageOffline } from '../offline/template-drafter';
import { getAiMode } from '../../config/runtime-mode';
import {
  INTENT_NAMES,
  intentArgsSchemas,
  type IntentArgs,
  type IntentName,
} from '../../types/intents';
import type { MessageLanguage } from '../../types/conversation';
import { readMemoryText } from '../../types/memory';

export interface ToolContext {
  client: SupabaseClient;
  userId: string;
  timezone: string;
  language: MessageLanguage;
  aiProvider: AIProvider;
  now: Date;
}

export interface ToolResult {
  intent: IntentName;
  outcome: 'success' | 'ambiguous' | 'not_found';
  summary: string;
  data?: unknown;
}

function listText(items: string[]): string {
  return items.join(', ');
}

function memoryText(record: { valueJson: unknown } | null): string {
  return record ? readMemoryText(record.valueJson) : 'nothing';
}

async function handleCreateCommitment(ctx: ToolContext, args: IntentArgs<'create_commitment'>): Promise<ToolResult> {
  const commitment = await commitmentsService.createImportantDate(ctx.client, ctx.userId, args);
  return {
    intent: 'create_commitment',
    outcome: 'success',
    summary: `Added '${commitment.title}' on ${commitment.dueDate}.`,
    data: commitment,
  };
}

async function handleCreateTask(ctx: ToolContext, args: IntentArgs<'create_task'>): Promise<ToolResult> {
  const task = await tasksService.createTask(ctx.client, ctx.userId, args);
  const due = task.dueDate ? ` due ${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}` : '';
  return { intent: 'create_task', outcome: 'success', summary: `Added task '${task.title}'${due}.`, data: task };
}

async function handleCreateReminder(ctx: ToolContext, args: IntentArgs<'create_reminder'>): Promise<ToolResult> {
  const reminder = await remindersService.createReminder(ctx.client, ctx.userId, args);
  const when = reminder.dueDate ? ` on ${reminder.dueDate}` : '';
  const recur = reminder.recurrenceRule ? ` (${reminder.recurrenceRule})` : '';
  return {
    intent: 'create_reminder',
    outcome: 'success',
    summary: `Set a reminder: '${reminder.title}'${when}${recur}.`,
    data: reminder,
  };
}

async function handleCreateFinancialObligation(
  ctx: ToolContext,
  args: IntentArgs<'create_financial_obligation'>,
): Promise<ToolResult> {
  const { obligation } = await financeService.createObligation(ctx.client, ctx.userId, args, ctx.now, ctx.timezone);
  return {
    intent: 'create_financial_obligation',
    outcome: 'success',
    summary: `Tracking ${obligation.accountName}: ${obligation.currency} ${obligation.amount} due on day ${obligation.dueDay} each month.`,
    data: obligation,
  };
}

async function handleMarkPaid(ctx: ToolContext, args: IntentArgs<'mark_paid'>): Promise<ToolResult> {
  const result = await financeService.markPaid(ctx.client, ctx.userId, args, ctx.now, ctx.timezone);
  const who = args.accountName ?? 'that obligation';

  switch (result.status) {
    case 'not_found':
      return { intent: 'mark_paid', outcome: 'not_found', summary: `I couldn't find an obligation matching '${who}'.` };
    case 'ambiguous':
      return {
        intent: 'mark_paid',
        outcome: 'ambiguous',
        summary: `I found more than one obligation matching '${who}': ${listText(result.candidates.map((c) => c.accountName))}. Which one did you mean?`,
        data: result.candidates,
      };
    case 'unchanged':
      return {
        intent: 'mark_paid',
        outcome: 'success',
        summary: `${who} for ${result.instance.period} was already marked paid — no change made.`,
        data: result.instance,
      };
    case 'updated':
      return {
        intent: 'mark_paid',
        outcome: 'success',
        summary: `${result.wasCorrection ? 'Updated' : 'Marked'} ${who} paid for ${result.instance.period}: ${result.instance.paidAmount} on ${result.instance.paidDate}.`,
        data: result.instance,
      };
  }
}

async function handleMarkDone(ctx: ToolContext, args: IntentArgs<'mark_done'>): Promise<ToolResult> {
  const result = await commitmentsService.markDone(ctx.client, ctx.userId, args);
  const who = args.title ?? 'that item';

  if (result.status === 'not_found') {
    return { intent: 'mark_done', outcome: 'not_found', summary: `I couldn't find a pending item matching '${who}'.` };
  }
  if (result.status === 'ambiguous') {
    return {
      intent: 'mark_done',
      outcome: 'ambiguous',
      summary: `I found more than one pending item matching '${who}': ${listText(result.candidates.map((c) => c.title))}. Which one did you mean?`,
      data: result.candidates,
    };
  }
  return { intent: 'mark_done', outcome: 'success', summary: `Marked '${result.commitment.title}' done.`, data: result.commitment };
}

async function handleReschedule(ctx: ToolContext, args: IntentArgs<'reschedule'>): Promise<ToolResult> {
  const result = await commitmentsService.reschedule(ctx.client, ctx.userId, args);
  const who = args.title ?? 'that item';

  if (result.status === 'not_found') {
    return { intent: 'reschedule', outcome: 'not_found', summary: `I couldn't find a pending item matching '${who}'.` };
  }
  if (result.status === 'ambiguous') {
    return {
      intent: 'reschedule',
      outcome: 'ambiguous',
      summary: `I found more than one pending item matching '${who}': ${listText(result.candidates.map((c) => c.title))}. Which one did you mean?`,
      data: result.candidates,
    };
  }
  const time = result.commitment.dueTime ? ` at ${result.commitment.dueTime}` : '';
  return {
    intent: 'reschedule',
    outcome: 'success',
    summary: `Moved '${result.commitment.title}' to ${result.commitment.dueDate}${time}.`,
    data: result.commitment,
  };
}

async function handleListPending(ctx: ToolContext, args: IntentArgs<'list_pending'>): Promise<ToolResult> {
  const wantsPayments = args.type === 'ALL' || args.type === 'PAYMENT';

  const dueBefore =
    args.withinDays !== undefined
      ? new Date(ctx.now.getTime() + args.withinDays * 86_400_000).toISOString().slice(0, 10)
      : undefined;

  const lines: string[] = [];
  let count = 0;

  if (args.type !== 'PAYMENT') {
    const commitments = await commitmentsService.listPending(ctx.client, ctx.userId, {
      type: args.type === 'ALL' ? undefined : args.type,
      dueBefore,
    });
    for (const c of commitments) {
      lines.push(`- [${c.type}] ${c.title}${c.dueDate ? ` (due ${c.dueDate})` : ''}`);
    }
    count += commitments.length;
  }

  if (wantsPayments) {
    const payments = await financeService.listUpcomingPayments(ctx.client, ctx.userId, ctx.now, ctx.timezone, args.withinDays);
    for (const p of payments) {
      lines.push(
        `- [PAYMENT] ${p.obligation.accountName}: ${p.obligation.currency} ${p.instance.expectedAmount} due ${p.dueDate}${p.isOverdue ? ' (overdue)' : ''}`,
      );
    }
    count += payments.length;
  }

  const summary = count === 0 ? 'Nothing pending.' : `You have ${count} pending item(s):\n${lines.join('\n')}`;
  return { intent: 'list_pending', outcome: 'success', summary, data: { count, lines } };
}

async function handleCalculateMonthlyRequirement(
  ctx: ToolContext,
  args: IntentArgs<'calculate_monthly_requirement'>,
): Promise<ToolResult> {
  const result = await financeService.calculateMonthlyRequirement(ctx.client, ctx.userId, ctx.now, ctx.timezone, args.period);
  const summary =
    result.breakdown.length === 0
      ? `No recurring obligations found for ${result.period}.`
      : result.breakdown
          .map((b) => `${result.period}: ${b.currency} ${b.totalFormatted} across ${b.count} obligation(s)`)
          .join('\n');
  return { intent: 'calculate_monthly_requirement', outcome: 'success', summary, data: result };
}

async function handleRememberPreference(ctx: ToolContext, args: IntentArgs<'remember_preference'>): Promise<ToolResult> {
  const result = await memoryService.rememberPreference(ctx.client, ctx.userId, args, ctx.now, ctx.timezone);
  const subject = memoryService.normalizeKey(args.key).replace(/_/g, ' ');

  // Correcting an earlier value is worth saying out loud — silently replacing something
  // the user told Symora last month is exactly the surprise that erodes trust in it.
  const summary =
    result.outcome === 'unchanged'
      ? `I already had that — ${subject} is ${args.value}.`
      : result.outcome === 'superseded'
        ? `Updated: ${subject} is now ${args.value} (was ${memoryText(result.supersededMemory)}).`
        : `Got it — I'll remember that ${subject} is ${args.value}.`;

  return { intent: 'remember_preference', outcome: 'success', summary, data: result.memory };
}

/**
 * Drafting through a chat turn, with the same offline path `/api/drafts` already takes.
 *
 * This tool used to go straight to the provider in every mode, so a turn that reached
 * drafting with no key configured — or with a key whose account is out of credit — threw
 * out of `runTool` and 500'd `/api/chat`, while the identical request through
 * `/api/drafts` was answered from templates. Same rule as extraction
 * (ai/orchestrator/resilient-extraction.ts): use the model when it answers, fall back to
 * the deterministic path when it does not. The templates are honestly worse prose, not a
 * failure — they are meant to be edited before sending, which the handoff assumes.
 */
async function draftWithFallback(
  ctx: ToolContext,
  args: IntentArgs<'draft_message'>,
): Promise<DraftMessageResult> {
  if (getAiMode() === 'offline') return draftMessageOffline(args, ctx.language);
  try {
    return await draftMessage(ctx.aiProvider, args, ctx.language);
  } catch {
    return draftMessageOffline(args, ctx.language);
  }
}

async function handleDraftMessage(ctx: ToolContext, args: IntentArgs<'draft_message'>): Promise<ToolResult> {
  const draft = await draftWithFallback(ctx, args);
  return {
    intent: 'draft_message',
    outcome: 'success',
    summary: `Short: ${draft.short}\n\nDetailed: ${draft.detailed}`,
    data: draft,
  };
}

/**
 * Reachable only if interpret_pasted_message somehow proceeds without the caller's
 * special-case handling (api/chat intercepts it before generic dispatch — see that
 * file's comment). Defensive fallback, not the normal path.
 */
async function handleInterpretPastedMessage(): Promise<ToolResult> {
  return {
    intent: 'interpret_pasted_message',
    outcome: 'not_found',
    summary: 'Pasted content must go through the confirmation flow before any action is taken.',
  };
}

interface ToolEntry<N extends IntentName> {
  description: string;
  // Widened to ZodTypeAny (rather than the precise per-intent schema type): the union
  // across all 12 intents' schemas — several with .refine() — makes TS choke on
  // "excessively deep" instantiation when it flows into zodToJsonSchema below. Runtime
  // behavior is unaffected; runTool already validates+casts per intent.
  argsSchema: z.ZodTypeAny;
  isHighImpact: boolean;
  handler: (ctx: ToolContext, args: IntentArgs<N>) => Promise<ToolResult>;
}

const registry: { [N in IntentName]: ToolEntry<N> } = {
  create_commitment: {
    description: 'Create an important date (birthday, anniversary, renewal).',
    argsSchema: intentArgsSchemas.create_commitment,
    isHighImpact: false,
    handler: handleCreateCommitment,
  },
  create_task: {
    description: 'Create a task.',
    argsSchema: intentArgsSchemas.create_task,
    isHighImpact: false,
    handler: handleCreateTask,
  },
  create_reminder: {
    description: 'Create a one-time or recurring reminder.',
    argsSchema: intentArgsSchemas.create_reminder,
    isHighImpact: false,
    handler: handleCreateReminder,
  },
  create_financial_obligation: {
    description: 'Create a new recurring financial obligation (EMI, rent, bill, subscription, insurance).',
    argsSchema: intentArgsSchemas.create_financial_obligation,
    isHighImpact: true,
    handler: handleCreateFinancialObligation,
  },
  mark_paid: {
    description: 'Mark a financial obligation paid for a period.',
    argsSchema: intentArgsSchemas.mark_paid,
    isHighImpact: true,
    handler: handleMarkPaid,
  },
  mark_done: {
    description: 'Mark a task, reminder, or important date as done.',
    argsSchema: intentArgsSchemas.mark_done,
    isHighImpact: false,
    handler: handleMarkDone,
  },
  reschedule: {
    description: 'Move a task or reminder to a new due date/time.',
    argsSchema: intentArgsSchemas.reschedule,
    isHighImpact: false,
    handler: handleReschedule,
  },
  list_pending: {
    description: "List the user's pending commitments and payments.",
    argsSchema: intentArgsSchemas.list_pending,
    isHighImpact: false,
    handler: handleListPending,
  },
  calculate_monthly_requirement: {
    description: 'Compute the total amount due for a month.',
    argsSchema: intentArgsSchemas.calculate_monthly_requirement,
    isHighImpact: false,
    handler: handleCalculateMonthlyRequirement,
  },
  remember_preference: {
    description: 'Remember a stated fact or preference.',
    argsSchema: intentArgsSchemas.remember_preference,
    isHighImpact: false,
    handler: handleRememberPreference,
  },
  draft_message: {
    description: 'Draft a short and a warm/detailed message variant, in one call.',
    argsSchema: intentArgsSchemas.draft_message,
    isHighImpact: false,
    handler: handleDraftMessage,
  },
  interpret_pasted_message: {
    description:
      'Interpret pasted third-party text (payment confirmation, booking, appointment, renewal) and propose an action. Use this whenever the user pastes or quotes a message from someone else and asks what to do with it.',
    argsSchema: intentArgsSchemas.interpret_pasted_message,
    isHighImpact: true,
    handler: handleInterpretPastedMessage,
  },
};

export function isHighImpactIntent(intent: IntentName): boolean {
  return registry[intent].isHighImpact;
}

export function getToolDescription(intent: IntentName): string {
  return registry[intent].description;
}

export function getArgsSchema(intent: IntentName): z.ZodTypeAny {
  return registry[intent].argsSchema;
}

export type ToolArgsValidation =
  | { ok: true; args: unknown }
  /** The field paths the arguments got wrong, so the reply can name them. */
  | { ok: false; fields: string[] };

/**
 * Validates a proposed tool call's arguments without running it.
 *
 * ai-pipeline.md: "Invalid arguments are a rejected tool call, not a coerced one." A
 * rejection is an expected state, not an exception — the model can return a confident
 * tool call with a required field missing or an amount as words, and the user whose
 * perfectly clear sentence produced it should get a question about the missing detail,
 * not a 500. `runTool` below still parses strictly; this exists so a caller can find
 * out *before* deciding to proceed, confirm, or ask.
 */
export function validateToolArgs(intent: IntentName, args: unknown): ToolArgsValidation {
  const parsed = registry[intent].argsSchema.safeParse(args);
  if (parsed.success) return { ok: true, args: parsed.data };

  const fields = [
    ...new Set(
      parsed.error.issues.map((issue) => (issue.path.length > 0 ? issue.path.join('.') : 'the details')),
    ),
  ];
  return { ok: false, fields };
}

export async function runTool(ctx: ToolContext, intent: IntentName, args: unknown): Promise<ToolResult> {
  const entry = registry[intent];
  const parsed = entry.argsSchema.parse(args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return entry.handler(ctx, parsed as any);
}

/**
 * Every tool's model-facing schema gets one extra field beyond its pure domain args:
 * `confidence`. It's stripped before the domain handler ever sees it (Zod's default
 * "strip unknown keys" behavior on `entry.argsSchema.parse`) — this keeps the args
 * schemas in types/intents.ts pure domain shapes while still giving
 * confidence-risk.ts the self-reported number ai-pipeline.md's confidence gate needs.
 */
function withConfidence(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = { ...((schema.properties as Record<string, unknown> | undefined) ?? {}) };
  properties.confidence = {
    type: 'number',
    minimum: 0,
    maximum: 1,
    description: "How confident you are that this correctly captures the user's request, from 0 to 1.",
  };
  const required = Array.isArray(schema.required) ? [...schema.required, 'confidence'] : ['confidence'];
  return { ...schema, properties, required };
}

/** JSON-schema tool definitions handed to the AIProvider (native tool calling). */
export function buildToolDefinitions(): AIToolDefinition[] {
  return INTENT_NAMES.map((name) => ({
    name,
    description: registry[name].description,
    // zod-to-json-schema's generic signature hits "excessively deep" instantiation
    // against the widened ZodTypeAny above; `any` here is a type-level-only escape hatch.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: withConfidence(zodToJsonSchema(registry[name].argsSchema as any, { target: 'openApi3' }) as Record<string, unknown>),
  }));
}
