export type CommitmentType = 'PAYMENT' | 'TASK' | 'REMINDER' | 'IMPORTANT_DATE';
export type CommitmentStatus = 'pending' | 'done' | 'cancelled';
export type CommitmentPriority = 'low' | 'normal' | 'high';
export type CommitmentSource = 'chat' | 'voice' | 'paste' | 'manual';

export interface CommitmentRecord {
  id: string;
  userId: string;
  type: CommitmentType;
  title: string;
  description: string | null;
  dueDate: string | null;
  dueTime: string | null;
  recurrenceRule: string | null;
  /** Days before dueDate this should surface. Null means on the due date itself. */
  leadDays: number | null;
  status: CommitmentStatus;
  priority: CommitmentPriority;
  source: CommitmentSource;
  createdAt: string;
  updatedAt: string;
}

export type CommitmentRecurrence = 'none' | 'yearly' | 'monthly' | 'weekly';
export type CommitmentUrgency = 'overdue' | 'due-today' | 'due-soon' | 'upcoming';

/**
 * A commitment plus the fields that are always computed as of "today" in the user's
 * timezone and never stored. See domain/commitments/recurrence.ts.
 */
export interface CommitmentView extends CommitmentRecord {
  recurrence: CommitmentRecurrence;
  /** For a recurring commitment, the next date it falls on. Null for a lapsed one-off. */
  nextOccurrence: string | null;
  /** When it should surface, accounting for leadDays. */
  fireDate: string | null;
  /** Null for anything not pending — a done item is not "overdue". */
  urgency: CommitmentUrgency | null;
}
