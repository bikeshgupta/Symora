import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runTool } from './registry';
import type { AIProvider } from '../../adapters/ai-provider';

/** draft_message touches no repository, so the client is never dereferenced here. */
const ctxFor = (aiProvider: AIProvider) => ({
  client: {} as SupabaseClient,
  userId: '00000000-0000-0000-0000-000000000001',
  timezone: 'Asia/Kolkata',
  language: 'en' as const,
  aiProvider,
  now: new Date('2026-09-05T09:00:00Z'),
});

const failing: AIProvider = {
  name: 'test',
  complete: async () => {
    throw new Error('429 You have no credits remaining.');
  },
};

const args = { context: 'the tap in the kitchen is leaking', recipientRelationship: 'plumber', confidence: 0.9 };

describe('draft_message when the provider is unavailable', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_MODEL_CHEAP;
  });

  it('returns templated variants instead of throwing out of runTool', async () => {
    // A configured key whose account is out of credit: the old path threw here and
    // /api/chat turned it into a 500.
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'gpt-5-mini';

    const result = await runTool(ctxFor(failing), 'draft_message', args);

    expect(result.outcome).toBe('success');
    expect((result.data as { model: string }).model).toBe('offline-template');
    expect(result.summary).toContain('leaking');
  });

  it('does not call the provider at all in offline mode', async () => {
    // No key configured — the mode check short-circuits before any network attempt.
    const exploding: AIProvider = {
      name: 'test',
      complete: async () => {
        throw new Error('the provider must not be called in offline mode');
      },
    };

    const result = await runTool(ctxFor(exploding), 'draft_message', args);

    expect((result.data as { model: string }).model).toBe('offline-template');
  });

  it('still prefers the model when it answers', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'gpt-5-mini';
    const working: AIProvider = {
      name: 'test',
      complete: async () => ({
        text: null,
        toolCalls: [],
        structured: { short: 'Short prose.', detailed: 'Detailed prose.' },
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        model: 'test-model',
        finishReason: 'stop' as const,
      }),
    };

    const result = await runTool(ctxFor(working), 'draft_message', args);

    expect((result.data as { model: string }).model).toBe('test-model');
    expect(result.summary).toContain('Short prose.');
  });
});
