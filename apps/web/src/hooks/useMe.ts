import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface RuntimeCapabilities {
  aiMode: 'ai' | 'offline';
  /**
   * Four states, and they must not share a word in front of a user (CLAUDE.md):
   * `offline` is nothing configured, `unreachable` is configured and not answering — a
   * machine to switch back on — `rate_limited` is a free tier spent for now and clearing
   * by itself, and `ready` is working.
   */
  modelStatus: 'offline' | 'ready' | 'unreachable' | 'rate_limited';
  /** True when the endpoint is one the user runs, rather than a hosted API. */
  selfHostedModel: boolean;
  /** What to call the model layer in front of a user: "Gemini", "OpenAI", "your own model". */
  modelProvider: string;
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
