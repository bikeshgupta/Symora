/**
 * The route table for the single serverless function (see `api/[[...route]].ts`).
 *
 * Matching is exact-segment with one wildcard form (`:id`), and every route is listed
 * explicitly — there is no dynamic lookup by string, so a request path can only ever
 * reach a handler that appears in this file.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

import me from './me';
import chat from './chat';
import memoriesCollection from './memories-collection';
import memoriesItem from './memories-item';
import commitmentsCollection from './commitments-collection';
import commitmentsItem from './commitments-item';
import tasks from './tasks';
import reminders from './reminders';
import financeSummary from './finance-summary';
import financeObligations from './finance-obligations';
import financeInstances from './finance-instances';
import drafts from './drafts';
import home from './home';
import voiceTranscribe from './voice-transcribe';
import notificationsCollection from './notifications-collection';
import notificationsItem from './notifications-item';
import usage from './usage';
import privacyExport from './privacy-export';
import privacyDelete from './privacy-delete';

export type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

interface Route {
  /** Path segments. ':id' matches any single segment and is bound to req.query.id. */
  segments: string[];
  handler: RouteHandler;
}

const ROUTES: Route[] = [
  { segments: ['me'], handler: me },
  { segments: ['chat'], handler: chat },

  { segments: ['memories'], handler: memoriesCollection },
  { segments: ['memories', ':id'], handler: memoriesItem },

  { segments: ['commitments'], handler: commitmentsCollection },
  { segments: ['commitments', ':id'], handler: commitmentsItem },

  { segments: ['tasks'], handler: tasks },
  { segments: ['reminders'], handler: reminders },

  // The two more specific finance routes are listed before the summary so neither can
  // be shadowed; matching is exact per segment, but keeping the order obvious is worth
  // more than relying on that.
  { segments: ['finance', 'obligations'], handler: financeObligations },
  { segments: ['finance', 'instances'], handler: financeInstances },
  { segments: ['finance'], handler: financeSummary },

  { segments: ['drafts'], handler: drafts },
  { segments: ['home'], handler: home },
  { segments: ['voice', 'transcribe'], handler: voiceTranscribe },

  { segments: ['notifications'], handler: notificationsCollection },
  { segments: ['notifications', ':id'], handler: notificationsItem },

  { segments: ['usage'], handler: usage },
  { segments: ['privacy', 'export'], handler: privacyExport },
  { segments: ['privacy', 'delete'], handler: privacyDelete },
];

export interface RouteMatch {
  handler: RouteHandler;
  /** Values captured by wildcard segments, to be merged into req.query. */
  params: Record<string, string>;
}

/**
 * Finds the handler for a path.
 *
 * A literal segment beats a wildcard at the same position, so `/finance/obligations`
 * can never be swallowed by a `:id`-style route added later. Returns null for anything
 * unmatched, which the dispatcher turns into a 404 rather than a 500.
 */
export function matchRoute(segments: string[]): RouteMatch | null {
  let wildcardMatch: RouteMatch | null = null;

  for (const route of ROUTES) {
    if (route.segments.length !== segments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    let usedWildcard = false;

    for (let i = 0; i < route.segments.length; i += 1) {
      const expected = route.segments[i]!;
      const actual = segments[i]!;

      if (expected.startsWith(':')) {
        params[expected.slice(1)] = actual;
        usedWildcard = true;
        continue;
      }
      if (expected !== actual) {
        matched = false;
        break;
      }
    }

    if (!matched) continue;
    if (!usedWildcard) return { handler: route.handler, params };
    wildcardMatch ??= { handler: route.handler, params };
  }

  return wildcardMatch;
}

/** Every path this API serves, for the 404 body and for tests to assert against. */
export function listRoutes(): string[] {
  return ROUTES.map((route) => `/api/${route.segments.join('/')}`);
}
