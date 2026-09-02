/**
 * The twelve V1 intents (.claude/rules/ai-pipeline.md § V1 intents). Each schema is
 * the single source of truth for both the JSON Schema handed to the model (as a tool
 * definition) and the server-side validation of the model's (untrusted) tool call
 * arguments. Input that matches none of these is answered conversationally — adding a
 * thirteenth intent is a deliberate registry change, never an inline decision.
 */

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM');
const period = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
const priority = z.enum(['low', 'normal', 'high']);

export const createCommitmentArgs = z
  .object({
    // TASK and REMINDER have their own dedicated intents below; this one is for
    // everything else the commitments umbrella covers.
    type: z.literal('IMPORTANT_DATE').describe('The kind of commitment.'),
    title: z.string().min(1).describe('Short title, e.g. "Mom\'s birthday".'),
    description: z.string().optional(),
    dueDate: isoDate.describe('The date this falls on.'),
    recurrenceRule: z.string().optional().describe('e.g. "yearly" for a birthday.'),
  })
  .describe('Create an important date (birthday, anniversary, renewal date).');

export const createTaskArgs = z
  .object({
    title: z.string().min(1).describe('What needs to be done, e.g. "Call the electrician".'),
    dueDate: isoDate.optional(),
    dueTime: isoTime.optional(),
    priority: priority.optional(),
  })
  .describe('Create a simple task with an optional due date/time and priority.');

export const createReminderArgs = z
  .object({
    title: z.string().min(1),
    dueDate: isoDate.optional(),
    dueTime: isoTime.optional(),
    recurrenceRule: z.string().optional().describe('e.g. "monthly", "weekly on Saturday".'),
  })
  .describe('Create a one-time or recurring reminder.');

export const createFinancialObligationArgs = z
  .object({
    accountName: z.string().min(1).describe('e.g. "Home loan", "Netflix".'),
    obligationType: z.enum(['emi', 'rent', 'bill', 'subscription', 'insurance', 'other']),
    amount: z.number().positive().describe('The expected recurring amount.'),
    currency: z.string().length(3).default('INR'),
    dueDay: z.number().int().min(1).max(31).describe('Day of the month it falls due.'),
    recurrenceRule: z.string().default('monthly'),
  })
  .describe('Create a new recurring financial obligation (EMI, rent, bill, subscription, insurance).');

export const markPaidArgs = z
  .object({
    accountName: z.string().optional().describe('Which obligation, e.g. "home loan".'),
    obligationId: z.string().uuid().optional(),
    period: period.optional().describe('Defaults to the current month if omitted.'),
    amount: z.number().positive().optional().describe('Defaults to the obligation\'s expected amount.'),
    paidDate: isoDate.optional().describe('Defaults to today if omitted.'),
  })
  .refine((v) => Boolean(v.accountName || v.obligationId), {
    message: 'Either accountName or obligationId is required.',
  })
  .describe('Mark a financial obligation as paid for a period.');

export const markDoneArgs = z
  .object({
    commitmentId: z.string().uuid().optional(),
    title: z.string().optional().describe('Which task/reminder, matched against pending items.'),
  })
  .refine((v) => Boolean(v.commitmentId || v.title), {
    message: 'Either commitmentId or title is required.',
  })
  .describe('Mark a task, reminder, or important date as done.');

export const rescheduleArgs = z
  .object({
    commitmentId: z.string().uuid().optional(),
    title: z.string().optional(),
    newDueDate: isoDate,
    newDueTime: isoTime.optional(),
  })
  .refine((v) => Boolean(v.commitmentId || v.title), {
    message: 'Either commitmentId or title is required.',
  })
  .describe('Move a task or reminder to a new due date/time.');

export const listPendingArgs = z
  .object({
    type: z.enum(['PAYMENT', 'TASK', 'REMINDER', 'IMPORTANT_DATE', 'ALL']).default('ALL'),
    withinDays: z.number().int().positive().optional().describe('Only items due within N days.'),
  })
  .describe('List the user\'s pending commitments, optionally filtered by type or window.');

export const calculateMonthlyRequirementArgs = z
  .object({
    period: period.optional().describe('Defaults to the current month if omitted.'),
  })
  .describe('Compute the total amount due for a month, from stored financial instances.');

export const rememberPreferenceArgs = z
  .object({
    key: z.string().min(1).describe('A stable lookup key, e.g. "spouse_name".'),
    value: z.string().min(1),
    memoryType: z.enum(['preference', 'fact']).default('preference'),
  })
  .describe('Explicitly remember a stated fact or preference.');

export const draftMessageArgs = z
  .object({
    context: z.string().min(1).describe('What the message needs to say.'),
    recipientRelationship: z.string().optional().describe('e.g. "electrician", "landlord".'),
  })
  .describe('Draft a short and a warm/detailed variant of a message, in one call.');

export const interpretPastedMessageArgs = z
  .object({
    pastedText: z.string().min(1),
  })
  .describe('Interpret pasted third-party text (payment confirmation, booking, etc.) and propose an action.');

export const intentArgsSchemas = {
  create_commitment: createCommitmentArgs,
  create_task: createTaskArgs,
  create_reminder: createReminderArgs,
  create_financial_obligation: createFinancialObligationArgs,
  mark_paid: markPaidArgs,
  mark_done: markDoneArgs,
  reschedule: rescheduleArgs,
  list_pending: listPendingArgs,
  calculate_monthly_requirement: calculateMonthlyRequirementArgs,
  remember_preference: rememberPreferenceArgs,
  draft_message: draftMessageArgs,
  interpret_pasted_message: interpretPastedMessageArgs,
} as const;

export type IntentName = keyof typeof intentArgsSchemas;

export const INTENT_NAMES = Object.keys(intentArgsSchemas) as IntentName[];

export type IntentArgs<N extends IntentName> = z.infer<(typeof intentArgsSchemas)[N]>;
