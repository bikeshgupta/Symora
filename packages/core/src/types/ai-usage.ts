export interface AiUsageEventRecord {
  id: string;
  userId: string;
  provider: string;
  model: string;
  intent: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  createdAt: string;
}
