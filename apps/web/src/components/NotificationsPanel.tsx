import { CardShell, StatusPill } from '@/components/trusted';
import { Button } from '@/components/ui/button';
import {
  useMarkAllRead,
  useNotifications,
  useSetNotificationStatus,
} from '@/hooks/useNotifications';
import type { NotificationRecord } from '@symora/core';
import { cn } from '@/lib/cn';

const TYPE_LABEL: Record<NotificationRecord['type'], string> = {
  due_payment: 'Payment',
  task: 'Task',
  reminder: 'Reminder',
  important_date: 'Date',
};

/**
 * The notification inbox (PROGRESS.md Phase 8).
 *
 * In-app rather than push: V1 has no scheduler and no push service, so the server
 * generates what is due whenever this is read and the list catches up when the user
 * opens the app. Everything here is honest about that — nothing claims to have been
 * "sent".
 */
export function NotificationsPanel() {
  const { data, isLoading, isError, error } = useNotifications();
  const setStatus = useSetNotificationStatus();
  const markAllRead = useMarkAllRead();

  const notifications = data?.notifications ?? [];

  return (
    <CardShell as="section" aria-labelledby="notifications-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="notifications-heading" className="text-heading text-text-primary">
          Reminders
        </h2>
        {data && data.unreadCount > 0 && (
          <div className="flex items-center gap-3">
            <StatusPill tone="due-soon" label={`${data.unreadCount} new`} />
            <Button
              type="button"
              variant="ghost"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          </div>
        )}
      </div>

      {isLoading && <p className="mt-2 text-body-sm text-text-muted">Checking…</p>}
      {isError && (
        <p className="mt-2 text-body-sm text-overdue">
          {error instanceof Error ? error.message : "Couldn't load your reminders."}
        </p>
      )}

      {data && notifications.length === 0 && (
        <p className="mt-2 text-body-sm text-text-muted">
          Nothing to flag. Symora will put a reminder here on the day something is due.
        </p>
      )}

      {notifications.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                'rounded-md border border-border p-3',
                notification.status === 'pending' ? 'bg-surface' : 'bg-surface-raised',
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-caption text-text-muted">
                    {TYPE_LABEL[notification.type]}
                  </span>
                  <span className="ml-2 text-body-sm font-medium text-text-primary">
                    {notification.title}
                  </span>
                </div>
                <StatusPill
                  tone={notification.status === 'pending' ? 'due-soon' : 'neutral'}
                  label={notification.status === 'pending' ? 'New' : 'Seen'}
                />
              </div>
              <p className="mt-1 text-body-sm text-text-muted">{notification.body}</p>

              <div className="mt-2 flex gap-2">
                {notification.status === 'pending' && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate({ id: notification.id, status: 'read' })}
                  >
                    Got it
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: notification.id, status: 'dismissed' })}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
