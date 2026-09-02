/**
 * NotificationAdapter — delivery of due payments, tasks, reminders and important dates.
 *
 * Scheduling times are resolved in the user's timezone; the adapter receives an absolute
 * instant. See .claude/rules/finance-rules.md.
 *
 * Type-only stub. Phase 8 provides the implementation.
 */

export type NotificationChannel = 'push' | 'in_app';

export type NotificationKind =
  | 'due_payment'
  | 'task'
  | 'reminder'
  | 'important_date';

export interface NotificationPayload {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep link into the app, e.g. a commitment or financial instance. */
  deepLink?: string;
  /** Absolute instant to deliver at, in UTC. */
  scheduledFor: Date;
  /** Stable key so a redelivered schedule does not duplicate a notification. */
  idempotencyKey: string;
}

export interface NotificationSendResult {
  delivered: boolean;
  providerMessageId?: string;
  failureReason?: string;
}

export interface NotificationAdapter {
  readonly name: string;
  readonly channel: NotificationChannel;
  send(payload: NotificationPayload): Promise<NotificationSendResult>;
  cancel(idempotencyKey: string): Promise<void>;
}
