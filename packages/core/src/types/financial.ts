export type ObligationType = 'emi' | 'rent' | 'bill' | 'subscription' | 'insurance' | 'other';
export type FinancialInstanceStatus = 'pending' | 'paid' | 'partial' | 'skipped' | 'overdue';

export interface FinancialObligationRecord {
  id: string;
  userId: string;
  commitmentId: string;
  accountName: string;
  obligationType: ObligationType;
  amount: string;
  currency: string;
  dueDay: number;
  recurrenceRule: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialInstanceRecord {
  id: string;
  userId: string;
  obligationId: string;
  period: string;
  expectedAmount: string;
  paidAmount: string | null;
  status: FinancialInstanceStatus;
  paidDate: string | null;
  createdAt: string;
  updatedAt: string;
}
