import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { FinanceSummary, FinancialObligationRecord } from '@symora/core';

const QUERY_KEY = ['finance'] as const;

export function useFinanceSummary(period?: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, period ?? 'current'],
    queryFn: () => apiFetch<FinanceSummary>(`/api/finance${period ? `?period=${period}` : ''}`),
  });
}

export interface NewObligation {
  accountName: string;
  obligationType: 'emi' | 'rent' | 'bill' | 'subscription' | 'insurance' | 'other';
  amount: number;
  currency: string;
  dueDay: number;
}

export function useCreateObligation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewObligation) =>
      apiFetch<FinancialObligationRecord>('/api/finance/obligations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useMarkInstancePaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { instanceId: string; amount?: number }) =>
      apiFetch<unknown>('/api/finance/instances', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
