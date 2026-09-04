import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { HomePayload } from '@symora/core';

export function useHome() {
  return useQuery({
    queryKey: ['home'],
    queryFn: () => apiFetch<HomePayload>('/api/home'),
  });
}
