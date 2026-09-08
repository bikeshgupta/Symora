import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface Health {
  database: 'ok' | 'unreachable' | 'schema_incomplete';
  tables: { answered: number; expected: number };
  model: {
    mode: 'ai' | 'offline';
    status: 'offline' | 'ready' | 'unreachable' | 'rate_limited';
    provider: string;
  };
  checkedAt: string;
}

/**
 * Asked for, not polled. This is a thing you look at when something is wrong, and a
 * background poll of every dependency would be a database round trip a minute for a
 * screen nobody is reading.
 */
export function useHealth(enabled: boolean) {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<Health>('/api/health'),
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}
