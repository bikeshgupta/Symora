import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface RuntimeCapabilities {
  aiMode: 'ai' | 'offline';
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
