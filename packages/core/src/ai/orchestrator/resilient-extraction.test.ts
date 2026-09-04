import { describe, expect, it, vi } from 'vitest';
import { extractIntentResilient } from './resilient-extraction';
import { buildTemporalAnchors } from '../../domain/temporal/temporal-context';
import type { AIProvider } from '../../adapters/ai-provider';

const temporal = buildTemporalAnchors(new Date('2026-09-05T09:00:00Z'), 'Asia/Kolkata');

function provider(complete: AIProvider['complete']): AIProvider {
  return { name: 'test', complete };
}

const failing = () => provider(async () => { throw new Error('429 You have no credits remaining.'); });

describe('extractIntentResilient', () => {
  it('returns the model result untouched when the provider works', async () => {
    const working = provider(async () => ({
      text: null,
      toolCalls: [{ id: 't1', name: 'create_task', arguments: { title: 'Call plumber', confidence: 0.9 } }],
      structured: null,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'test-model',
      finishReason: 'tool_calls' as const,
    }));

    const result = await extractIntentResilient(working, 'call the plumber', 'en', { temporal });

    expect(result.degraded).toBe(false);
    expect(result.intent).toBe('create_task');
    expect(result.model).toBe('test-model');
  });

  it('falls back to the rule parser instead of throwing when the provider fails', async () => {
    // The no-credits case: previously this escaped to withApiHandler and became a 500.
    const result = await extractIntentResilient(failing(), 'call the electrician on Saturday', 'en', { temporal });

    expect(result.degraded).toBe(true);
    expect(result.intent).toBe('create_task');
    // Usage stays honest — the failed call produced no tokens to bill.
    expect(result.usage.totalTokens).toBe(0);
  });

  it('hands the real provider error to the caller for logging', async () => {
    const onProviderFailure = vi.fn();

    await extractIntentResilient(failing(), 'what is pending?', 'en', { temporal, onProviderFailure });

    expect(onProviderFailure).toHaveBeenCalledTimes(1);
    expect(String(onProviderFailure.mock.calls[0]![0])).toContain('no credits');
  });

  it('reports degraded even when the rule parser also finds no intent', async () => {
    // The caller needs this to explain the real reason rather than blame the phrasing.
    const result = await extractIntentResilient(failing(), 'hmm', 'en', { temporal });

    expect(result.degraded).toBe(true);
    expect(result.intent).toBeNull();
  });

  it('honours forcePaste on the fallback path', async () => {
    const result = await extractIntentResilient(failing(), 'short text', 'en', { temporal, forcePaste: true });

    expect(result.degraded).toBe(true);
    expect(result.intent).toBe('interpret_pasted_message');
  });
});
