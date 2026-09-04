/**
 * The single serverless function that serves every /api/* route.
 *
 * Vercel turns each file under `api/` into its own function, and the Hobby plan allows
 * twelve per deployment. Symora's API groups already exceed that, so the handlers live
 * in `api/_routes/` — the leading underscore keeps Vercel from treating them as
 * functions — and this catch-all dispatches to them. One function, no per-route ceiling,
 * and the handlers themselves are unchanged.
 *
 * Auth is not weakened by the consolidation: every handler is still wrapped in
 * `withApiHandler`, so each request is independently verified and each builds its own
 * request context (.claude/rules/auth-security.md § Identity).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listRoutes, matchRoute } from './_routes/router';

function toSegments(route: string | string[] | undefined): string[] {
  if (Array.isArray(route)) return route;
  if (typeof route === 'string' && route.length > 0) return route.split('/');
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const segments = toSegments(req.query.route).filter((segment) => segment.length > 0);
  const match = matchRoute(segments);

  if (!match) {
    // Deliberately the same error contract as everything else, so a typo in a path is
    // as legible as any other failure.
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `No API route matches /api/${segments.join('/')}.`,
        requestId: 'unrouted',
      },
    });
    return;
  }

  // A dynamic segment reaches the handler the same way Vercel's own [id] routing would
  // deliver it, so the handlers did not have to change when they moved.
  Object.assign(req.query, match.params);

  await match.handler(req, res);
}

export { listRoutes };
