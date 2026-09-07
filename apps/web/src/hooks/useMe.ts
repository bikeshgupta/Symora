import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface RuntimeCapabilities {
  aiMode: 'ai' | 'offline';
  /**
   * Three states, not two (CLAUDE.md): `offline` is nothing configured, `unreachable` is
   * configured and not answering — a machine the user can switch back on — and `ready`
   * is working. They must not share a word in front of a user.
   */
  modelStatus: 'offline' | 'ready' | 'unreachable';
  /** True when the endpoint is one the user runs, rather than a hosted API. */
  selfHostedModel: boolean;
  serverTranscription: boolean;
  draftingIsTemplated: boolean;
}

export interface Me {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  timezone: string;
  preferredLanguage: 'en' | 'hi' | 'hinglish';
  createdAt: string;
  updatedAt: string;
  capabilities: RuntimeCapabilities;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<Me>('/api/me'),
  });
}
