/**
 * The notifications domain service (PROGRESS.md Phase 8).
 *
 * Generation is idempotent and cheap enough to run on every read of the inbox, which is
 * how notifications work at all without a scheduler: there is no cron in V1, so the app
 * catches up whenever the user opens it. A background job can call `generate` later
 * without changing anything here — the dedupe key means running it both ways is safe.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as notificationsRepository from '../../repositories/notifications-repository';
import * as commitmentsService from '../commitments/commitments-service';
import * as financeService from '../finance/finance-service';
import { localDateString, localPeriodString } from '../finance/period';
import { planNotifications } from './notification-planner';
import type { NotificationRecord, NotificationStatus } from '../../types/notification';

export { planNotifications, buildDedupeKey } from './notification-planner';

/**
 * Materialise everything due as of today. Returns how many rows were newly created —
 * zero on a second run the same day, which is the point.
 */
export async function generate(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
): Promise<number> {
  const today = localDateString(now, timezone);
  const period = localPeriodString(now, timezone);

  const [instances, commitments] = await Promise.all([
    financeService.listInstances(client, userId, period, now, timezone),
    commitmentsService.list(client, userId, { status: 'pending' }, now, timezone),
  ]);

  const planned = planNotifications({ instances, commitments }, today);

  return notificationsRepository.upsertNotifications(
    client,
    planned.map((notification) => ({ userId, ...notification })),
  );
}

export interface NotificationInbox {
  notifications: NotificationRecord[];
  unreadCount: number;
  /** How many were created by this call — surfaced for debugging, not for the UI. */
  generated: number;
}

export async function getInbox(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
  params: { includeDismissed?: boolean } = {},
): Promise<NotificationInbox> {
  const generated = await generate(client, userId, now, timezone);

  const [notifications, unreadCount] = await Promise.all([
    notificationsRepository.listNotifications(client, userId, {
      includeDismissed: params.includeDismissed,
    }),
    notificationsRepository.countPending(client, userId),
  ]);

  return { notifications, unreadCount, generated };
}

export async function setStatus(
  client: SupabaseClient,
  userId: string,
  id: string,
  status: NotificationStatus,
): Promise<NotificationRecord | null> {
  return notificationsRepository.updateStatus(client, userId, id, status);
}

export async function markAllRead(client: SupabaseClient, userId: string): Promise<number> {
  return notificationsRepository.markAllRead(client, userId);
}
