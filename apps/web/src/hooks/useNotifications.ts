import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { NotificationRecord } from '@symora/core';

const QUERY_KEY = ['notifications'] as const;

export interface NotificationInbox {
  notifications: NotificationRecord[];
  unreadCount: number;
  generated: number;
}

export function useNotifications() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<NotificationInbox>('/api/notifications'),
    // The server generates on read, so refetching on focus is what makes a reminder
    // appear when the user comes back to the tab the day it is due.
    refetchOnWindowFocus: true,
  });
}

export function useSetNotificationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'read' | 'dismissed' }) =>
      apiFetch<NotificationRecord>(`/api/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ updated: number }>('/api/notifications', { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
