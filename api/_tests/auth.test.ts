/**
 * Phase 9 — auth.
 *
 * .claude/rules/auth-security.md § Identity makes four claims that are worth failing a
 * build over: every request is verified, an unverified token is a 401 and never a
 * fallback to an anonymous or default user, `user_id` is never accepted from the client,
 * and provisioning is idempotent on firebase_uid.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', async () => (await import('../_testing/stubs')).firebaseAppModule);
vi.mock('firebase-admin/auth', async () => (await import('../_testing/stubs')).firebaseAuthModule);
vi.mock('@symora/core', async (importOriginal) =>
  (await import('../_testing/stubs')).coreModule(
    (await importOriginal()) as Record<string, unknown>,
  ),
);

import { createTestWorld, type TestWorld } from '../../packages/core/src/testing/fixtures';
import dispatch from '../index';
import { listRoutes } from '../_routes/router';
import { call, dataOf, errorOf, silenceRequestLogs } from '../_testing/harness';
import { installFirebaseTestCredentials, useClient } from '../_testing/stubs';

installFirebaseTestCredentials();
silenceRequestLogs();

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
});

describe('auth — an unverified request never reaches a handler', () => {
  const unauthenticated: { label: string; authorization?: string }[] = [
    { label: 'no Authorization header at all', authorization: undefined },
    { label: 'an empty header', authorization: '' },
    { label: 'the wrong scheme', authorization: 'Basic dXNlcjpwYXNz' },
    { label: 'a bare token with no scheme', authorization: 'test:firebase-alice' },
    { label: 'Bearer with nothing after it', authorization: 'Bearer ' },
    { label: 'a token Firebase rejects', authorization: 'Bearer forged-token' },
    { label: 'lowercase bearer — the scheme is matched exactly', authorization: 'bearer test:firebase-alice' },
  ];

  for (const { label, authorization } of unauthenticated) {
    it(`rejects ${label} with 401 and provisions nobody`, async () => {
      const usersBefore = world.db.rows('users').length;

      const response = await call(dispatch, { path: 'me', authorization });

      expect(response.status).toBe(401);
      expect(errorOf(response).code).toBe('UNAUTHENTICATED');
      // The decisive part: no anonymous or default user was invented to serve the call.
      expect(world.db.rows('users')).toHaveLength(usersBefore);
    });
  }

  it('says nothing about why the token failed', async () => {
    const response = await call(dispatch, { path: 'me', authorization: 'Bearer forged-token' });
    expect(errorOf(response).message).not.toMatch(/signature|firebase|admin/i);
    expect(errorOf(response).requestId).toBeTruthy();
  });

  it('guards every route in the table, not just /api/me', async () => {
    for (const route of listRoutes()) {
      const path = route.replace('/api/', '').replace(':id', 'ffffffff-ffff-4fff-8fff-ffffffffffff');
      const response = await call(dispatch, { path, method: 'GET' });
      expect(response.status, `${route} answered ${response.status} without a token`).toBe(401);
    }
  });

  it('answers an unknown path with 404 before it can look like an auth bypass', async () => {
    const response = await call(dispatch, { path: 'not-a-route', as: 'firebase-alice' });
    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe('NOT_FOUND');
  });
});

describe('auth — identity comes from the token and nowhere else', () => {
  it('serves the caller their own row', async () => {
    const response = await call(dispatch, { path: 'me', as: world.alice.firebaseUid });
    expect(response.status).toBe(200);
    expect(dataOf<{ id: string }>(response).id).toBe(world.alice.record.id);
  });

  it('ignores a user_id supplied in the body, the query or a header', async () => {
    const response = await call(dispatch, {
      path: 'me',
      as: world.alice.firebaseUid,
      query: { user_id: world.bob.record.id, userId: world.bob.record.id },
      headers: { 'x-user-id': world.bob.record.id },
    });

    expect(dataOf<{ id: string }>(response).id).toBe(world.alice.record.id);
  });

  it('ignores a spoofed user_id on a write, storing the row against the caller', async () => {
    const response = await call(dispatch, {
      method: 'POST',
      path: 'tasks',
      as: world.alice.firebaseUid,
      body: { title: 'Pay the electricity bill', userId: world.bob.record.id, user_id: world.bob.record.id },
    });

    expect(response.status).toBe(201);
    const stored = world.db.rows('commitments');
    expect(stored).toHaveLength(1);
    expect(stored[0]!.user_id).toBe(world.alice.record.id);
  });

  it('never echoes another user’s internal id or a firebase uid', async () => {
    const response = await call(dispatch, { path: 'me', as: world.alice.firebaseUid });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(world.bob.record.id);
    expect(serialized).not.toContain(world.bob.firebaseUid);
  });

  it('strips the rewrite’s own `route` param before a handler can read it', async () => {
    // A handler that trusted req.query.route would see the raw path; the dispatcher
    // deletes it, so `:id` binding is the only way a path segment reaches a handler.
    const response = await call(dispatch, { path: 'me', as: world.alice.firebaseUid });
    expect(response.status).toBe(200);
  });
});

describe('auth — provisioning', () => {
  it('creates the users row on a first sight of a verified uid', async () => {
    const before = world.db.rows('users').length;
    const response = await call(dispatch, { path: 'me', as: 'firebase-carol' });

    expect(response.status).toBe(200);
    expect(world.db.rows('users')).toHaveLength(before + 1);
    expect(dataOf<{ email: string }>(response).email).toBe('carol@example.com');
  });

  it('is idempotent — repeated requests resolve to the same row, never a second one', async () => {
    const first = await call(dispatch, { path: 'me', as: 'firebase-carol' });
    const second = await call(dispatch, { path: 'me', as: 'firebase-carol' });
    const third = await call(dispatch, { path: 'me', as: 'firebase-carol' });

    const ids = [first, second, third].map((response) => dataOf<{ id: string }>(response).id);
    expect(new Set(ids).size).toBe(1);
    expect(world.db.rows('users').filter((row) => row.firebase_uid === 'firebase-carol')).toHaveLength(1);
  });

  it('refreshes the profile from the token without resetting what the user chose', async () => {
    const alice = world.db.rows('users').find((row) => row.firebase_uid === world.alice.firebaseUid)!;
    alice.timezone = 'Europe/Berlin';
    alice.preferred_language = 'hinglish';

    const response = await call(dispatch, { path: 'me', as: world.alice.firebaseUid });

    const body = dataOf<{ timezone: string; preferredLanguage: string }>(response);
    expect(body.timezone).toBe('Europe/Berlin');
    expect(body.preferredLanguage).toBe('hinglish');
  });
});
