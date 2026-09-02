/**
 * The only module that queries `public.financial_obligations` and
 * `public.financial_instances`. See finance-rules.md for the obligation-vs-instance
 * separation these two tables encode.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FinancialInstanceRecord,
  FinancialInstanceStatus,
  FinancialObligationRecord,
  ObligationType,
} from '../types/financial';

interface ObligationRow {
  id: string;
  user_id: string;
  commitment_id: string;
  account_name: string;
  obligation_type: ObligationType;
  amount: string;
  currency: string;
  due_day: number;
  recurrence_rule: string;
  created_at: string;
  updated_at: string;
}

interface InstanceRow {
  id: string;
  user_id: string;
  obligation_id: string;
  period: string;
  expected_amount: string;
  paid_amount: string | null;
  status: FinancialInstanceStatus;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
}

function toObligationRecord(row: ObligationRow): FinancialObligationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    commitmentId: row.commitment_id,
    accountName: row.account_name,
    obligationType: row.obligation_type,
    amount: row.amount,
    currency: row.currency,
    dueDay: row.due_day,
    recurrenceRule: row.recurrence_rule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInstanceRecord(row: InstanceRow): FinancialInstanceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    obligationId: row.obligation_id,
    period: row.period,
    expectedAmount: row.expected_amount,
    paidAmount: row.paid_amount,
    status: row.status,
    paidDate: row.paid_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateObligationParams {
  userId: string;
  commitmentId: string;
  accountName: string;
  obligationType: ObligationType;
  amount: number;
  currency: string;
  dueDay: number;
  recurrenceRule: string;
}

export async function createObligation(
  client: SupabaseClient,
  params: CreateObligationParams,
): Promise<FinancialObligationRecord> {
  const { data, error } = await client
    .from('financial_obligations')
    .insert({
      user_id: params.userId,
      commitment_id: params.commitmentId,
      account_name: params.accountName,
      obligation_type: params.obligationType,
      amount: params.amount,
      currency: params.currency,
      due_day: params.dueDay,
      recurrence_rule: params.recurrenceRule,
    })
    .select()
    .single<ObligationRow>();

  if (error || !data) {
    throw new Error(`Failed to create obligation: ${error?.message ?? 'unknown error'}`);
  }
  return toObligationRecord(data);
}

export async function listObligations(
  client: SupabaseClient,
  userId: string,
): Promise<FinancialObligationRecord[]> {
  const { data, error } = await client
    .from('financial_obligations')
    .select()
    .eq('user_id', userId)
    .returns<ObligationRow[]>();

  if (error) throw new Error(`Failed to list obligations: ${error.message}`);
  return (data ?? []).map(toObligationRecord);
}

export async function findObligationsByAccountName(
  client: SupabaseClient,
  userId: string,
  accountName: string,
): Promise<FinancialObligationRecord[]> {
  const { data, error } = await client
    .from('financial_obligations')
    .select()
    .eq('user_id', userId)
    .ilike('account_name', `%${accountName}%`)
    .returns<ObligationRow[]>();

  if (error) throw new Error(`Failed to search obligations: ${error.message}`);
  return (data ?? []).map(toObligationRecord);
}

export async function getInstanceForPeriod(
  client: SupabaseClient,
  userId: string,
  obligationId: string,
  period: string,
): Promise<FinancialInstanceRecord | null> {
  const { data, error } = await client
    .from('financial_instances')
    .select()
    .eq('user_id', userId)
    .eq('obligation_id', obligationId)
    .eq('period', period)
    .maybeSingle<InstanceRow>();

  if (error) throw new Error(`Failed to load instance: ${error.message}`);
  return data ? toInstanceRecord(data) : null;
}

export interface CreateInstanceParams {
  userId: string;
  obligationId: string;
  period: string;
  expectedAmount: number;
}

/**
 * Idempotent via the DB's unique (obligation_id, period) constraint
 * (finance-rules.md § Instance generation): if a concurrent request already created
 * this period's instance, we fetch and return that one instead of erroring.
 */
export async function getOrCreateInstanceForPeriod(
  client: SupabaseClient,
  params: CreateInstanceParams,
): Promise<FinancialInstanceRecord> {
  const existing = await getInstanceForPeriod(client, params.userId, params.obligationId, params.period);
  if (existing) return existing;

  const { data, error } = await client
    .from('financial_instances')
    .insert({
      user_id: params.userId,
      obligation_id: params.obligationId,
      period: params.period,
      expected_amount: params.expectedAmount,
    })
    .select()
    .single<InstanceRow>();

  if (error) {
    if (error.code === '23505') {
      const raced = await getInstanceForPeriod(client, params.userId, params.obligationId, params.period);
      if (raced) return raced;
    }
    throw new Error(`Failed to create instance: ${error.message}`);
  }
  return toInstanceRecord(data!);
}

export interface UpdateInstancePaidParams {
  status: FinancialInstanceStatus;
  paidAmount: number;
  paidDate: string;
}

export async function updateInstancePaidState(
  client: SupabaseClient,
  userId: string,
  instanceId: string,
  params: UpdateInstancePaidParams,
): Promise<FinancialInstanceRecord> {
  const { data, error } = await client
    .from('financial_instances')
    .update({ status: params.status, paid_amount: params.paidAmount, paid_date: params.paidDate })
    .eq('id', instanceId)
    .eq('user_id', userId)
    .select()
    .single<InstanceRow>();

  if (error || !data) {
    throw new Error(`Failed to update instance ${instanceId}: ${error?.message ?? 'unknown error'}`);
  }
  return toInstanceRecord(data);
}

export async function listInstancesByStatus(
  client: SupabaseClient,
  userId: string,
  statuses: FinancialInstanceStatus[],
): Promise<FinancialInstanceRecord[]> {
  const { data, error } = await client
    .from('financial_instances')
    .select()
    .eq('user_id', userId)
    .in('status', statuses)
    .returns<InstanceRow[]>();

  if (error) throw new Error(`Failed to list instances: ${error.message}`);
  return (data ?? []).map(toInstanceRecord);
}
