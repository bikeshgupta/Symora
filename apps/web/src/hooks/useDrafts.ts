import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { DraftVariantWithHandoff } from '@symora/core';

export interface DraftResponse {
  variants: DraftVariantWithHandoff[];
  language: 'en' | 'hi' | 'hinglish';
}

export interface DraftRequest {
  context: string;
  recipientRelationship?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  subject?: string;
}

export function useDraftMessage() {
  return useMutation({
    mutationFn: (input: DraftRequest) =>
      apiFetch<DraftResponse>('/api/drafts', { method: 'POST', body: JSON.stringify(input) }),
  });
}
