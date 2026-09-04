import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CommitmentView } from '@symora/core';

const QUERY_KEY = ['commitments'] as const;

export interface NewCommitment {
  type: 'TASK' | 'REMINDER' | 'IMPORTANT_DATE';
  title: string;
  dueDate?: string;
  priority?: 'low' | 'normal' | 'high';
  leadDays?: number;
  recurrenceRule?: string;
}

export function useCommitments(status: 'pending' | 'done' = 'pending') {
  return useQuery({
    queryKey: [...QUERY_KEY, status],
    queryFn: () => apiFetch<CommitmentView[]>(`/api/commitments?status=${status}`),
  });
}

export function useCreateCommitment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCommitment) =>
      apiFetch<CommitmentView>('/api/commitments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateCommitment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: 'pending' | 'done'; dueDate?: string }) =>
      apiFetch<CommitmentView>(`/api/commitments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useCancelCommitment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<CommitmentView>(`/api/commitments/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
