/**
 * The only module that writes `public.ai_usage_events`
 * (.claude/rules/ai-pipeline.md § Provider and model use: "metering is part of the
 * call path, not an optional afterthought"). Append-only — no update/delete here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecordAiUsageParams {
  userId: string;
  provider: string;
  model: string;
  intent: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number | null;
}

export async function recordAiUsage(
  client: SupabaseClient,
  params: RecordAiUsageParams,
): Promise<void> {
  const { error } = await client.from('ai_usage_events').insert({
    user_id: params.userId,
    provider: params.provider,
    model: params.model,
    intent: params.intent,
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens,
    total_tokens: params.totalTokens,
    estimated_cost_usd: params.estimatedCostUsd ?? null,
  });

  if (error) throw new Error(`Failed to record AI usage: ${error.message}`);
}

export interface UsageTotals {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/**
 * Totals for one period. Summed in the application rather than by the database so the
 * same code runs against any driver, and because the row count at V1 volumes is small —
 * a user makes tens of AI calls a month, not millions.
 */
export async function getUsageSince(
  client: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<UsageTotals> {
  const { data, error } = await client
    .from('ai_usage_events')
    .select('prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .returns<
      {
        prompt_tokens: number | null;
        completion_tokens: number | null;
        total_tokens: number | null;
        estimated_cost_usd: number | string | null;
      }[]
    >();

  if (error) throw new Error(`Failed to load usage: ${error.message}`);

  const rows = data ?? [];
  return {
    requests: rows.length,
    promptTokens: rows.reduce((sum, row) => sum + (row.prompt_tokens ?? 0), 0),
    completionTokens: rows.reduce((sum, row) => sum + (row.completion_tokens ?? 0), 0),
    totalTokens: rows.reduce((sum, row) => sum + (row.total_tokens ?? 0), 0),
    estimatedCostUsd: rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0),
  };
}
