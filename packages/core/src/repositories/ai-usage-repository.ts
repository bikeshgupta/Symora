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
