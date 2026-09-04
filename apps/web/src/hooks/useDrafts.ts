import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { DraftVariantWithHandoff } from '@symora/core';

export interface DraftResponse {
  variants: DraftVariantWithHandoff[];
  language: 'en' | 'hi' | 'hinglish';
  /** True when the deployment has no AI key and these came from templates. */
  templated: boolean;
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
