import { describe, expect, it, vi } from 'vitest';
import { createTimedFetch } from './supabase-client';

describe('createTimedFetch', () => {
  it('passes a healthy response straight through', async () => {
    const ok = new Response('{}', { status: 200 });
    const timed = createTimedFetch(async () => ok, 1_000);

    await expect(timed('https://example.test')).resolves.toBe(ok);
  });

  it('gives up on a request that never settles, and says what happened', async () => {
    // The case that took the deployment down: supabase-js applies no timeout of its own,
    // so this request would have run until the platform killed the whole function.
    const timed = createTimedFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      40,
    );

    await expect(timed('https://example.test')).rejects.toThrow(/did not respond within 40ms/);
  });

  it('names the configuration a reader should go and check', async () => {
    const timed = createTimedFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      20,
    );

    await expect(timed('https://example.test')).rejects.toThrow(/SUPABASE_URL/);
  });

  it('reports a real network failure as itself, not as a timeout', async () => {
    const timed = createTimedFetch(async () => {
      throw new Error('getaddrinfo ENOTFOUND db.example.test');
    }, 1_000);

    await expect(timed('https://example.test')).rejects.toThrow(/ENOTFOUND/);
  });

  it("keeps the caller's own abort signal", async () => {
    // supabase-js exposes .abortSignal(); dropping it would be a worse bug than the one
    // the timeout fixes.
    const caller = new AbortController();
    const timed = createTimedFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('caller aborted')));
        }),
      10_000,
    );

    const inflight = timed('https://example.test', { signal: caller.signal });
    caller.abort();

    await expect(inflight).rejects.toThrow(/caller aborted/);
  });

  it('clears its timer so a finished request cannot keep the function alive', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const timed = createTimedFetch(async () => new Response('{}'), 1_000);

    await timed('https://example.test');

    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
