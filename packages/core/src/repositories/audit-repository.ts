/**
 * The only module that queries `public.audit_events`
 * (.claude/rules/auth-security.md § Row Level Security: "audit_events is append-only:
 * policies grant insert and select, never update or delete").
 *
 * That rule is why this file exposes exactly two functions. There is no update and no
 * delete here, and none anywhere else — an audit trail a bug can rewrite is not an audit
 * trail. Rows still go when their user does, via the cascade from `users`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The security- and privacy-relevant actions V1 records. Matches migration 0010's check
 * constraint, which is what actually enforces it. Account deletion is absent on purpose:
 * this table cascades away with the user, so a row recording the deletion would be
 * deleted by it.
 */
export type AuditAction = 'access_denied' | 'payment_corrected' | 'memory_deleted';

export interface AuditEventRecord {
  id: string;
  userId: string;
  action: AuditAction;
  targetTable: string | null;
  targetId: string | null;
  detail: unknown;
  requestId: string | null;
  createdAt: string;
}

interface AuditEventRow {
  id: string;
  user_id: string;
  action: AuditAction;
  target_table: string | null;
  target_id: string | null;
  detail: unknown;
  request_id: string | null;
  created_at: string;
}

function toRecord(row: AuditEventRow): AuditEventRecord {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    targetTable: row.target_table,
    targetId: row.target_id,
    detail: row.detail,
    requestId: row.request_id,
    createdAt: row.created_at,
  };
}

export interface RecordAuditEventParams {
  userId: string;
  action: AuditAction;
  targetTable?: string | null;
  targetId?: string | null;
  /**
   * Structured context only — an amount, a status, a method and path. Never memory,
   * message or draft content: see the migration's comment for why that line matters.
   */
  detail?: Record<string, unknown> | null;
  requestId?: string | null;
}

export async function recordAuditEvent(
  client: SupabaseClient,
  params: RecordAuditEventParams,
): Promise<void> {
  const { error } = await client.from('audit_events').insert({
    user_id: params.userId,
    action: params.action,
    target_table: params.targetTable ?? null,
    target_id: params.targetId ?? null,
    detail: params.detail ?? null,
    request_id: params.requestId ?? null,
  });

  if (error) throw new Error(`Failed to record audit event: ${error.message}`);
}

export async function listAuditEvents(
  client: SupabaseClient,
  userId: string,
  limit = 100,
): Promise<AuditEventRecord[]> {
  const { data, error } = await client
    .from('audit_events')
    .select()
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<AuditEventRow[]>();

  if (error) throw new Error(`Failed to list audit events: ${error.message}`);
  return (data ?? []).map(toRecord);
}
