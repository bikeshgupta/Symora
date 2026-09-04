/**
 * Deciding which notifications should exist (PROGRESS.md Phase 8).
 *
 * Pure. Given today's commitments and payment instances, it returns the notifications
 * that are due — writing them is the repository's job, and the unique index on
 * `dedupe_key` is what makes writing them twice a no-op.
 *
 * Notifications are *derived*, never queued ahead: the source row is the truth, and a
 * notification is a record that the user was told once. That is why nothing here
 * schedules into the future — a reminder for a due date the user then changes would
 * otherwise fire on the old date.
 */

import { classifyDueDate, computeFireDate, daysBetween } from '../commitments/recurrence';
import type { CommitmentView } from '../../types/commitment';
import type { NotificationType } from '../../types/notification';
import type { InstanceView } from '../finance/finance-service';

export interface PlannedNotification {
  commitmentId: string | null;
  instanceId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  scheduledFor: string;
  dedupeKey: string;
}

/**
 * One notification per source per occurrence per type. Including the date is what lets a
 * monthly reminder fire again next month without the unique index rejecting it as a
 * duplicate of last month's.
 */
export function buildDedupeKey(
  source: 'commitment' | 'instance',
  sourceId: string,
  type: NotificationType,
  scheduledFor: string,
): string {
  return `${source}:${sourceId}:${type}:${scheduledFor}`;
}

function dueWording(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days < 0) return days === -1 ? 'was due yesterday' : `was due ${-days} days ago`;
  if (days === 0) return 'is due today';
  if (days === 1) return 'is due tomorrow';
  return `is due in ${days} days`;
}

/**
 * Payment notifications: anything unpaid that is due today or already late.
 *
 * Nothing fires for a payment still comfortably ahead — a notification a week early is
 * noise, and noise is what makes people turn notifications off.
 */
export function planPaymentNotifications(
  instances: InstanceView[],
  today: string,
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const view of instances) {
    if (view.instance.status === 'paid' || view.instance.status === 'skipped') continue;

    const days = daysBetween(today, view.state.dueDate);
    if (days > 0) continue;

    planned.push({
      commitmentId: null,
      instanceId: view.instance.id,
      type: 'due_payment',
      title: view.obligation.accountName,
      body: `${view.obligation.currency} ${view.state.outstandingFormatted} ${dueWording(view.state.dueDate, today)}.`,
      scheduledFor: today,
      dedupeKey: buildDedupeKey('instance', view.instance.id, 'due_payment', today),
    });
  }

  return planned;
}

const TYPE_BY_COMMITMENT: Record<string, NotificationType> = {
  TASK: 'task',
  REMINDER: 'reminder',
  IMPORTANT_DATE: 'important_date',
};

/**
 * Commitment notifications, honouring each one's lead time.
 *
 * A reminder with `leadDays: 2` fires on its fire date, not its due date — that is the
 * whole point of "remind me 2 days before". The due date itself also fires, so a lead
 * time surfaces something early rather than instead.
 */
export function planCommitmentNotifications(
  commitments: CommitmentView[],
  today: string,
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const commitment of commitments) {
    if (commitment.status !== 'pending') continue;
    if (commitment.type === 'PAYMENT') continue; // Payments notify off their instances.

    const due = commitment.nextOccurrence ?? commitment.dueDate;
    if (!due) continue;

    const type = TYPE_BY_COMMITMENT[commitment.type];
    if (!type) continue;

    const fireDate = computeFireDate(due, commitment.leadDays);
    const urgency = classifyDueDate(due, today);

    // Fires on the lead date, on the day itself, and every day it stays overdue.
    const shouldFire = today === fireDate || today === due || urgency === 'overdue';
    if (!shouldFire) continue;

    planned.push({
      commitmentId: commitment.id,
      instanceId: null,
      type,
      title: commitment.title,
      body:
        today === fireDate && fireDate !== due
          ? `Coming up on ${due}.`
          : `${commitment.title} ${dueWording(due, today)}.`,
      scheduledFor: today,
      dedupeKey: buildDedupeKey('commitment', commitment.id, type, today),
    });
  }

  return planned;
}

export function planNotifications(
  params: { instances: InstanceView[]; commitments: CommitmentView[] },
  today: string,
): PlannedNotification[] {
  return [
    ...planPaymentNotifications(params.instances, today),
    ...planCommitmentNotifications(params.commitments, today),
  ];
}
