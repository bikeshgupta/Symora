/**
 * Phase 9 — .claude/rules/auth-security.md § Errors and logging: "Logs carry the request
 * id and user_id. They never carry tokens, secrets, or full memory/message content."
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

let lines: string[];

beforeEach(() => {
  lines = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('writes one JSON line carrying the request id and user id', () => {
    createLogger({ requestId: 'req-1', userId: 'user-1' }).info('handled');

    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ level: 'info', message: 'handled', requestId: 'req-1', userId: 'user-1' });
    expect(entry.timestamp).toBeTruthy();
  });

  it('redacts credentials whatever case the key arrives in', () => {
    createLogger({ requestId: 'req-1' }).error('auth failed', {
      token: 'eyJhbGciOi.secret.value',
      Authorization: 'Bearer eyJhbGciOi',
      apiKey: 'sk-live-abc123',
      SERVICE_ROLE_KEY: 'super-secret',
      private_key: '-----BEGIN PRIVATE KEY-----',
    });

    const line = lines[0]!;
    for (const secret of ['eyJhbGciOi', 'sk-live-abc123', 'super-secret', 'BEGIN PRIVATE KEY']) {
      expect(line, `leaked ${secret}`).not.toContain(secret);
    }
    expect(JSON.parse(line).token).toBe('[redacted]');
  });

  it('routes each level to the matching console channel', () => {
    const logger = createLogger({ requestId: 'req-1' });
    logger.info('a');
    logger.warn('b');
    logger.error('c');

    expect(lines.map((line) => JSON.parse(line).level)).toEqual(['info', 'warn', 'error']);
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('omits userId entirely when the context has none, rather than logging a placeholder', () => {
    createLogger({ requestId: 'req-1' }).info('pre-auth');
    expect(Object.keys(JSON.parse(lines[0]!))).not.toContain('userId');
  });
});
