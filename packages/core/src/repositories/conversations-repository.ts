/**
 * The only module that queries `public.conversations` and `public.messages`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConversationRecord,
  MessageLanguage,
  MessageRecord,
  MessageRole,
} from '../types/conversation';

interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  user_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  language: MessageLanguage | null;
  intent: string | null;
  created_at: string;
}

function toConversationRecord(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessageRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    language: row.language,
    intent: row.intent,
    createdAt: row.created_at,
  };
}

export async function createConversation(
  client: SupabaseClient,
  userId: string,
  title?: string | null,
): Promise<ConversationRecord> {
  const { data, error } = await client
    .from('conversations')
    .insert({ user_id: userId, title: title ?? null })
    .select()
    .single<ConversationRow>();

  if (error || !data) {
    throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`);
  }
  return toConversationRecord(data);
}

/** A row that exists but belongs to another user returns null, never that row. */
export async function getConversationById(
  client: SupabaseClient,
  userId: string,
  id: string,
): Promise<ConversationRecord | null> {
  const { data, error } = await client
    .from('conversations')
    .select()
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<ConversationRow>();

  if (error) throw new Error(`Failed to load conversation ${id}: ${error.message}`);
  return data ? toConversationRecord(data) : null;
}

export interface CreateMessageParams {
  userId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  language?: MessageLanguage | null;
  intent?: string | null;
}

export async function createMessage(
  client: SupabaseClient,
  params: CreateMessageParams,
): Promise<MessageRecord> {
  const { data, error } = await client
    .from('messages')
    .insert({
      user_id: params.userId,
      conversation_id: params.conversationId,
      role: params.role,
      content: params.content,
      language: params.language ?? null,
      intent: params.intent ?? null,
    })
    .select()
    .single<MessageRow>();

  if (error || !data) {
    throw new Error(`Failed to create message: ${error?.message ?? 'unknown error'}`);
  }
  return toMessageRecord(data);
}
