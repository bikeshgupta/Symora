export interface ConversationRecord {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant';
export type MessageLanguage = 'en' | 'hi' | 'hinglish';

export interface MessageRecord {
  id: string;
  userId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  language: MessageLanguage | null;
  intent: string | null;
  createdAt: string;
}
