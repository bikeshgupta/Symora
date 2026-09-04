import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { UsageSummary } from '@symora/core';

export function useUsage() {
  return useQuery({ queryKey: ['usage'], queryFn: () => apiFetch<UsageSummary>('/api/usage') });
}
