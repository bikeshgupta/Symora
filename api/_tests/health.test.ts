/**
 * /api/health, through the real route.
 *
 * It exists for the state the rest of the API cannot report on: a database that is not
 * answering takes down every endpoint at once, including the middleware that would
 * otherwise turn the failure into a readable error. So this one is tested for exactly
 * that case as much as for the happy one.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', async () => (await import('../_testing/stubs')).firebaseAppModule);
vi.mock('firebase-admin/auth', async () => (await import('../_testing/stubs')).firebaseAuthModule);
vi.mock('@symora/core', async (importOriginal) =>
  (await import('../_testing/stubs')).coreModule(
    (await importOriginal()) as Record<string, unknown>,
  ),
);

import { createTestWorld, type TestWorld } from '../../packages/core/src/testing/fixtures';
import dispatch from '../index';
import { call, dataOf, errorOf, silenceRequestLogs, type TestResponse } from '../_testing/harness';
import { installFirebaseTestCredentials, useClient } from '../_testing/stubs';
import type { HealthResponse } from '../_routes/health';

installFirebaseTestCredentials();
silenceRequestLogs();

const ORIGINAL_ENV = { ...process.env };

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
});

function health(as?: string): Promise<TestResponse> {
  return call(dispatch, { method: 'GET', path: 'health', as });
}

describe('/api/health', () => {
  it('reports a working deployment', async () => {
    const body = dataOf<HealthResponse>(await health(world.alice.firebaseUid));

    expect(body.database).toBe('ok');
    expect(body.tables.answered).toBe(body.tables.expected);
    expect(body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('answers even when the database is not there', async () => {
    // The whole point: the endpoint that says "the database is down" must not need the
    // database to say it.
    useClient({
      from() {
        throw new Error('The database did not respond within 8000ms.');
      },
    } as never);

    const response = await health(world.alice.firebaseUid);

    expect(response.status).toBe(200);
    expect(dataOf<HealthResponse>(response).database).toBe('unreachable');
  });

  it('says the schema is incomplete when a table is missing', async () => {
    const real = world.client;
    useClient({
      from(table: string) {
        if (table === 'ai_usage_events') {
          return {
            select: () => ({
              limit: async () => ({ error: { message: 'relation "ai_usage_events" does not exist' } }),
            }),
          };
        }

        return (real as unknown as { from: (t: string) => unknown }).from(table);
      },
    } as never);

    const body = dataOf<HealthResponse>(await health(world.alice.firebaseUid));

    expect(body.database).toBe('schema_incomplete');
    expect(body.tables.answered).toBe(body.tables.expected - 1);
  });

  it('never names a table, a URL, or a driver message', async () => {
    useClient({
      from() {
        throw new Error('connect ECONNREFUSED db.abcdefgh.supabase.co:5432');
      },
    } as never);

    const serialized = JSON.stringify((await health(world.alice.firebaseUid)).body);

    expect(serialized).not.toContain('supabase.co');
    expect(serialized).not.toContain('ECONNREFUSED');
    expect(serialized).not.toContain('ai_usage_events');
  });

  it('refuses an unauthenticated caller — deployment state is not public', async () => {
    const response = await health();

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('UNAUTHENTICATED');
  });

  it('reports the model layer alongside the database', async () => {
    process.env.AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'gemini-2.5-flash-lite';

    const body = dataOf<HealthResponse>(await health(world.alice.firebaseUid));

    expect(body.model).toEqual({ mode: 'ai', status: 'ready', provider: 'Gemini' });
  });
});
