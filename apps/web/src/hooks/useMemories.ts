import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { MemoryType, MemoryView } from '@symora/core';

const QUERY_KEY = ['memories'] as const;

export function useMemories(includeSuperseded: boolean) {
  return useQuery({
    queryKey: [...QUERY_KEY, includeSuperseded],
    queryFn: () =>
      apiFetch<MemoryView[]>(`/api/memories${includeSuperseded ? '?includeSuperseded=true' : ''}`),
  });
}

export function useCreateMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: string; text: string; memoryType: MemoryType }) =>
      apiFetch<MemoryView>('/api/memories', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useEditMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; key?: string; text?: string }) =>
      apiFetch<MemoryView>(`/api/memories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/api/memories/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
