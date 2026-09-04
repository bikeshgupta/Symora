import { describe, expect, it } from 'vitest';
import { listRoutes, matchRoute } from './router';

describe('matchRoute', () => {
  it('matches a single-segment route', () => {
    expect(matchRoute(['me'])).not.toBeNull();
    expect(matchRoute(['home'])).not.toBeNull();
  });

  it('binds a wildcard segment to req.query.id', () => {
    const match = matchRoute(['memories', 'abc-123']);
    expect(match?.params).toEqual({ id: 'abc-123' });
  });

  it('prefers a literal segment over a wildcard at the same position', () => {
    // /finance/obligations must reach the obligations handler, never a :id route.
    const literal = matchRoute(['finance', 'obligations']);
    const wildcard = matchRoute(['commitments', 'obligations']);
    expect(literal).not.toBeNull();
    expect(literal?.params).toEqual({});
    // The same word under a collection that does take an :id is treated as an id.
    expect(wildcard?.params).toEqual({ id: 'obligations' });
  });

  it('distinguishes a collection from an item by segment count', () => {
    expect(matchRoute(['commitments'])?.params).toEqual({});
    expect(matchRoute(['commitments', 'x'])?.params).toEqual({ id: 'x' });
  });

  it('matches the two-segment routes', () => {
    expect(matchRoute(['voice', 'transcribe'])).not.toBeNull();
    expect(matchRoute(['privacy', 'export'])).not.toBeNull();
    expect(matchRoute(['privacy', 'delete'])).not.toBeNull();
  });

  it('returns null for an unknown path rather than falling through to something', () => {
    expect(matchRoute([])).toBeNull();
    expect(matchRoute(['nope'])).toBeNull();
    expect(matchRoute(['me', 'extra'])).toBeNull();
    expect(matchRoute(['privacy'])).toBeNull();
    expect(matchRoute(['privacy', 'export', 'deeper'])).toBeNull();
  });

  it('does not match a route with the right name but the wrong depth', () => {
    expect(matchRoute(['finance', 'obligations', 'x'])).toBeNull();
  });
});

describe('listRoutes', () => {
  it('covers every documented API group', () => {
    const routes = listRoutes();
    for (const path of [
      '/api/me',
      '/api/chat',
      '/api/memories',
      '/api/commitments',
      '/api/tasks',
      '/api/reminders',
      '/api/finance',
      '/api/drafts',
      '/api/notifications',
      '/api/usage',
      '/api/privacy/export',
      '/api/privacy/delete',
    ]) {
      expect(routes).toContain(path);
    }
  });

  it('has no duplicate paths', () => {
    const routes = listRoutes();
    expect(new Set(routes).size).toBe(routes.length);
  });
});
