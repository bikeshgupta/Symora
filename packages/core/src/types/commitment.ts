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
  status: CommitmentStatus;
  priority: CommitmentPriority;
  source: CommitmentSource;
  createdAt: string;
  updatedAt: string;
}
