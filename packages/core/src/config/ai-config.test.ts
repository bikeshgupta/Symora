import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_COOLDOWN_MS,
  DEFAULT_AI_TIMEOUT_MS,
  getAiApiKey,
  getAiApiKeyForClient,
  getAiBaseUrl,
  getAiCooldownMs,
  getAiModel,
  getAiTimeoutMs,
  getAiToolMode,
  isAiConfigured,
  readTimeoutMs,
} from './ai-config';

describe('getAiBaseUrl', () => {
  it('is undefined when unset or blank, meaning the hosted API', () => {
    expect(getAiBaseUrl({})).toBeUndefined();
    expect(getAiBaseUrl({ AI_BASE_URL: '   ' })).toBeUndefined();
  });

  it('strips a trailing slash', () => {
    // '…/v1/' + '/chat/completions' is '…/v1//chat/completions', which some servers 404.
    expect(getAiBaseUrl({ AI_BASE_URL: 'http://127.0.0.1:11434/v1/' })).toBe(
      'http://127.0.0.1:11434/v1',
    );
    expect(getAiBaseUrl({ AI_BASE_URL: 'https://ollama.example.com/v1//' })).toBe(
      'https://ollama.example.com/v1',
    );
  });
});

describe('getAiApiKey', () => {
  it('prefers AI_API_KEY', () => {
    expect(getAiApiKey({ AI_API_KEY: 'new', OPENAI_API_KEY: 'old' })).toBe('new');
  });

  it('falls back to OPENAI_API_KEY so an existing deployment keeps working', () => {
    expect(getAiApiKey({ OPENAI_API_KEY: 'old' })).toBe('old');
  });

  it('treats blank as unset', () => {
    expect(getAiApiKey({ AI_API_KEY: '  ', OPENAI_API_KEY: '' })).toBeUndefined();
  });

  it('gives the SDK a placeholder when there is genuinely no key', () => {
    // The client refuses to construct without one, and a self-hosted endpoint behind a
    // private tunnel may have no auth at all.
    expect(getAiApiKeyForClient({})).toBe('no-auth');
    expect(getAiApiKeyForClient({ AI_API_KEY: 'real' })).toBe('real');
  });
});

describe('getAiToolMode', () => {
  it('defaults to auto', () => {
    expect(getAiToolMode({})).toBe('auto');
  });

  it.each([
    ['native', 'native'],
    ['json', 'json'],
    ['JSON', 'json'],
    [' Native ', 'native'],
  ])('reads %s', (raw, expected) => {
    expect(getAiToolMode({ AI_TOOL_MODE: raw })).toBe(expected);
  });

  it('falls back to auto for anything it does not recognise', () => {
    expect(getAiToolMode({ AI_TOOL_MODE: 'functions' })).toBe('auto');
  });
});

describe('readTimeoutMs', () => {
  it('falls back for unset, blank, non-numeric and non-positive values', () => {
    // All four are what a half-filled .env actually looks like, and Number('') is 0 —
    // which an SDK reads as "time out immediately" rather than "not configured".
    for (const raw of [undefined, '', '   ', 'soon', '0', '-5']) {
      expect(readTimeoutMs(raw, 12_000)).toBe(12_000);
    }
  });

  it('uses a valid value', () => {
    expect(readTimeoutMs('8000', 12_000)).toBe(8_000);
  });
});

describe('timeouts', () => {
  it('defaults the request timeout below the function ceiling', () => {
    // vercel.json sets maxDuration to 30s. If the platform kills the function before the
    // provider times out, the user gets a raw 504 instead of the graceful fallback — so
    // the default must leave room, and a self-hosted model is exactly the slow case.
    expect(getAiTimeoutMs({})).toBe(DEFAULT_AI_TIMEOUT_MS);
    expect(DEFAULT_AI_TIMEOUT_MS).toBeLessThan(30_000);
  });

  it('reads an override', () => {
    expect(getAiTimeoutMs({ AI_REQUEST_TIMEOUT_MS: '8000' })).toBe(8_000);
  });

  it('defaults the unreachable cooldown to a minute', () => {
    expect(getAiCooldownMs({})).toBe(DEFAULT_AI_COOLDOWN_MS);
    expect(getAiCooldownMs({ AI_UNREACHABLE_COOLDOWN_MS: '15000' })).toBe(15_000);
  });
});

describe('isAiConfigured', () => {
  it('needs a model id whatever else is set', () => {
    // A key with no model would fail on the first call, which is worse than never
    // leaving offline mode.
    expect(isAiConfigured({ AI_API_KEY: 'sk-test' })).toBe(false);
    expect(isAiConfigured({ AI_BASE_URL: 'http://127.0.0.1:11434/v1' })).toBe(false);
  });

  it('needs a key when talking to the hosted API', () => {
    expect(isAiConfigured({ AI_MODEL_CHEAP: 'gpt-test' })).toBe(false);
    expect(isAiConfigured({ AI_MODEL_CHEAP: 'gpt-test', AI_API_KEY: 'sk-test' })).toBe(true);
  });

  it('does not need a key for an endpoint you run yourself', () => {
    expect(
      isAiConfigured({ AI_MODEL_CHEAP: 'qwen2.5:7b', AI_BASE_URL: 'http://127.0.0.1:11434/v1' }),
    ).toBe(true);
  });
});

describe('getAiModel', () => {
  it('reads each tier and treats blank as unset', () => {
    const env = { AI_MODEL_CHEAP: 'small', AI_MODEL_STRONG: '  ' };
    expect(getAiModel('cheap', env)).toBe('small');
    expect(getAiModel('strong', env)).toBeUndefined();
  });
});
