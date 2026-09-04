/**
 * The single serverless function that serves every /api/* route.
 *
 * Vercel turns each file under `api/` into its own function, and the Hobby plan allows
 * twelve per deployment. Symora's API groups already exceed that, so the handlers live
 * in `api/_routes/` — the leading underscore keeps Vercel from treating them as
 * functions — and this one dispatches to them. One function, no per-route ceiling, and
 * the handlers themselves are unchanged.
 *
 * The path arrives as the `route` query param, put there by the rewrite in
 * `vercel.json`. That rewrite is written `/api/:route(.*)` rather than the more familiar
 * `/api/:path*`: path-to-regexp v8, which the Vercel CLI now uses, rejects a repeated
 * parameter with no prefix or suffix and logs "Can not repeat" on every request. A named
 * parameter with an explicit pattern captures the same thing — everything after `/api/`,
 * slashes included — with no repetition modifier to object to. The path is NOT taken
 * from a bracketed filename. Catch-all filenames are a Next.js
 * convention: outside Next, Vercel's zero-config `api/` routing does not parse
 * `[...route]` or `[[...route]]` as a catch-all, it reads the whole thing as one
 * ordinary dynamic segment named `...route`. That failed quietly — `/api/me` reached
 * this function with no `route` param and 404'd here, while two-segment paths like
 * `/api/voice/transcribe` never matched at all and 404'd at the platform. A rewrite is
 * explicit and behaves the same in `vercel dev` as in production. The file must stay
 * unbracketed for it to work: rewrites are only consulted after the filesystem check,
 * so a bracketed name would match `/api/<anything>` first and shadow the rewrite.
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
  // The rewrite's own bookkeeping, not something a handler should ever see in its query.
  delete req.query.route;

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
