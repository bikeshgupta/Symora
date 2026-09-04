export type NotificationType = 'due_payment' | 'task' | 'reminder' | 'important_date';
export type NotificationStatus = 'pending' | 'read' | 'dismissed';

export interface NotificationRecord {
  id: string;
  userId: string;
  commitmentId: string | null;
  instanceId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  /** The wall-clock day this is for, in the user's timezone. */
  scheduledFor: string;
  status: NotificationStatus;
  readAt: string | null;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
}
