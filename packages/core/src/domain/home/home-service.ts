/**
 * The personalized home (PROGRESS.md Phase 6).
 *
 * The requirements are explicit that this is "not a generic dashboard": the home screen
 * answers "what needs me today?", not "here is everything about your account". So this
 * service ranks, it does not merely list — it pulls the few things that actually need
 * attention and leaves the rest to the dedicated screens.
 *
 * Everything is deterministic and computed at read time in the user's timezone. No AI is
 * involved in deciding what is urgent, and no number here is produced by a model
 * (.claude/rules/ai-pipeline.md: "The model never produces numbers that matter").
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsService from '../commitments/commitments-service';
import * as financeService from '../finance/finance-service';
import { localDateString } from '../finance/period';
import { daysBetween } from '../commitments/recurrence';
import type { CommitmentView } from '../../types/commitment';
import type { InstanceView } from '../finance/finance-service';

export type AttentionKind =
  | 'overdue_payment'
  | 'overdue_task'
  | 'due_today'
  | 'upcoming_payment'
  | 'important_date';

export type AttentionTone = 'overdue' | 'due-soon' | 'neutral';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: AttentionTone;
  title: string;
  /** Already-formatted supporting line. Deterministic, never model-written. */
  detail: string;
  /** Status wording. Never rendered as colour alone — see design-system.md. */
  statusLabel: string;
  dueDate: string | null;
  /** Lower sorts first. */
  rank: number;
}

export interface HomeGreeting {
  partOfDay: 'morning' | 'afternoon' | 'evening';
  displayName: string | null;
  today: string;
}

export interface HomeSuggestion {
  id: string;
  label: string;
  /** Prefilled text for the Ask Symora input when the chip is tapped. */
  prompt: string;
}

export interface HomePayload {
  greeting: HomeGreeting;
  attention: AttentionItem[];
  payments: {
    period: string;
    requiredByCurrency: { currency: string; totalFormatted: string }[];
    outstandingByCurrency: { currency: string; totalFormatted: string }[];
    overdueCount: number;
  };
  todayTasks: CommitmentView[];
  upcomingImportantDates: CommitmentView[];
  suggestions: HomeSuggestion[];
}

/**
 * Part of day from the wall-clock hour in the user's timezone.
 *
 * Read through Intl rather than off the Date, because the server's own hour is
 * irrelevant — someone in Kolkata should be greeted "good morning" at 9am their time,
 * whatever hour the server thinks it is (.claude/rules/finance-rules.md § Timezone).
 */
export function partOfDay(now: Date, timezone: string): HomeGreeting['partOfDay'] {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(now),
  );
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Ranks are spaced so a later kind can never outrank an earlier one on tie-breaks:
 * something already late always sits above something merely approaching.
 */
const KIND_RANK: Record<AttentionKind, number> = {
  overdue_payment: 0,
  overdue_task: 100,
  due_today: 200,
  upcoming_payment: 300,
  important_date: 400,
};

function daysLateLabel(dueDate: string, today: string): string {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return 'Overdue';
  return late === 1 ? '1 day late' : `${late} days late`;
}

function daysUntilLabel(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days <= 0) return 'Today';
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

export const MAX_ATTENTION_ITEMS = 5;
export const IMPORTANT_DATE_HORIZON_DAYS = 14;
export const UPCOMING_PAYMENT_HORIZON_DAYS = 7;

/**
 * The "Needs Attention" list. Capped deliberately: a home screen showing twenty things
 * that need attention communicates nothing, and the point of this screen is that one
 * glance is enough.
 */
export function buildAttention(
  params: {
    overduePayments: InstanceView[];
    upcomingPayments: InstanceView[];
    commitments: CommitmentView[];
  },
  today: string,
  limit = MAX_ATTENTION_ITEMS,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const view of params.overduePayments) {
    items.push({
      id: `payment:${view.instance.id}`,
      kind: 'overdue_payment',
      tone: 'overdue',
      title: view.obligation.accountName,
      detail: `${view.obligation.currency} ${view.state.outstandingFormatted} · due ${view.state.dueDate}`,
      statusLabel: daysLateLabel(view.state.dueDate, today),
      dueDate: view.state.dueDate,
      rank: KIND_RANK.overdue_payment,
    });
  }

  for (const commitment of params.commitments) {
    const due = commitment.nextOccurrence ?? commitment.dueDate;

    if (commitment.urgency === 'overdue' && due) {
      items.push({
        id: `commitment:${commitment.id}`,
        kind: 'overdue_task',
        tone: 'overdue',
        title: commitment.title,
        detail: `Was due ${due}`,
        statusLabel: daysLateLabel(due, today),
        dueDate: due,
        rank: KIND_RANK.overdue_task,
      });
      continue;
    }

    if (commitment.urgency === 'due-today' && due) {
      items.push({
        id: `commitment:${commitment.id}`,
        kind: 'due_today',
        tone: 'due-soon',
        title: commitment.title,
        detail: commitment.dueTime ? `Today at ${commitment.dueTime}` : 'Today',
        statusLabel: 'Due today',
        dueDate: due,
        rank: KIND_RANK.due_today,
      });
      continue;
    }

    // Important dates surface early on purpose — a birthday you find out about on the
    // day is a birthday you have already half-missed.
    if (
      commitment.type === 'IMPORTANT_DATE' &&
      due &&
      daysBetween(today, due) <= IMPORTANT_DATE_HORIZON_DAYS
    ) {
      items.push({
        id: `commitment:${commitment.id}`,
        kind: 'important_date',
        tone: 'neutral',
        title: commitment.title,
        detail: due,
        statusLabel: daysUntilLabel(due, today),
        dueDate: due,
        rank: KIND_RANK.important_date,
      });
    }
  }

  for (const view of params.upcomingPayments) {
    if (daysBetween(today, view.state.dueDate) > UPCOMING_PAYMENT_HORIZON_DAYS) continue;
    items.push({
      id: `payment:${view.instance.id}`,
      kind: 'upcoming_payment',
      tone: 'due-soon',
      title: view.obligation.accountName,
      detail: `${view.obligation.currency} ${view.state.outstandingFormatted} · due ${view.state.dueDate}`,
      statusLabel: daysUntilLabel(view.state.dueDate, today),
      dueDate: view.state.dueDate,
      rank: KIND_RANK.upcoming_payment,
    });
  }

  // Rank, then earliest due date, then id — a total order, so identical data always
  // renders in the same sequence rather than shuffling between loads.
  items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.dueDate !== b.dueDate) return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
    return a.id.localeCompare(b.id);
  });

  return items.slice(0, limit);
}

/**
 * Contextual suggestions, drawn from what is actually on screen.
 *
 * Phrased as things the user might say, because tapping a chip fills the Ask Symora
 * input — it is a shortcut into the same pipeline, not a separate command surface that
 * could bypass confirmation.
 */
export function buildSuggestions(params: {
  attention: AttentionItem[];
  hasPayments: boolean;
  hasCommitments: boolean;
}): HomeSuggestion[] {
  const suggestions: HomeSuggestion[] = [];

  const overduePayment = params.attention.find((item) => item.kind === 'overdue_payment');
  if (overduePayment) {
    suggestions.push({
      id: 'mark-overdue-paid',
      label: `Paid ${overduePayment.title}?`,
      prompt: `${overduePayment.title} paid`,
    });
  }

  if (params.hasPayments) {
    suggestions.push({
      id: 'monthly-total',
      label: "This month's total",
      prompt: 'How much do I need this month?',
    });
  }

  const overdueTask = params.attention.find((item) => item.kind === 'overdue_task');
  if (overdueTask) {
    suggestions.push({
      id: 'reschedule-task',
      label: `Move "${overdueTask.title}"`,
      prompt: `Move ${overdueTask.title} to tomorrow`,
    });
  }

  if (params.hasCommitments) {
    suggestions.push({ id: 'what-is-pending', label: "What's pending?", prompt: 'What is pending?' });
  } else {
    suggestions.push({
      id: 'first-payment',
      label: 'Add a recurring payment',
      prompt: 'Home loan 42500 every month on 5th',
    });
  }

  return suggestions.slice(0, 4);
}

export async function getHome(
  client: SupabaseClient,
  user: { id: string; displayName: string | null; timezone: string },
  now: Date,
): Promise<HomePayload> {
  const today = localDateString(now, user.timezone);

  const [summary, commitments] = await Promise.all([
    financeService.getSummary(client, user.id, now, user.timezone),
    commitmentsService.list(client, user.id, { status: 'pending' }, now, user.timezone),
  ]);

  const attention = buildAttention(
    { overduePayments: summary.overdue, upcomingPayments: summary.upcoming, commitments },
    today,
  );

  return {
    greeting: { partOfDay: partOfDay(now, user.timezone), displayName: user.displayName, today },
    attention,
    payments: {
      period: summary.period,
      requiredByCurrency: summary.requirement.breakdown.map((line) => ({
        currency: line.currency,
        totalFormatted: line.totalFormatted,
      })),
      outstandingByCurrency: summary.outstanding.map((line) => ({
        currency: line.currency,
        totalFormatted: line.totalFormatted,
      })),
      overdueCount: summary.overdue.length,
    },
    todayTasks: commitments.filter(
      (commitment) => commitment.type === 'TASK' && commitment.urgency === 'due-today',
    ),
    upcomingImportantDates: commitments.filter(
      (commitment) =>
        commitment.type === 'IMPORTANT_DATE' &&
        commitment.nextOccurrence !== null &&
        daysBetween(today, commitment.nextOccurrence) <= 30,
    ),
    suggestions: buildSuggestions({
      attention,
      hasPayments: summary.requirement.breakdown.length > 0,
      hasCommitments: commitments.length > 0,
    }),
  };
}
