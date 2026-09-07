/**
 * Drives the real API the way Vercel does: one request object through `api/index.ts`,
 * out through the route table, the auth middleware, a handler, a domain service and a
 * repository. TEST-ONLY.
 *
 * The leading underscore on the directory keeps Vercel from treating these as
 * deployable functions, the same reason `_routes/` and `_middleware/` are named that
 * way (api/index.ts).
 *
 * Only two things are substituted: Firebase token verification and the Supabase client.
 * Everything between them — routing, context building, validation, services, queries —
 * is the code that ships. That is the point: a cross-user test that stubbed the
 * repository would prove nothing about whether the repository filters by user_id.
 */

import { afterEach, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface TestRequestInit {
  method?: string;
  /** Path after /api/, e.g. 'memories/abc' — exactly what the vercel.json rewrite captures. */
  path: string;
  /** The firebase uid to present as. Omit to send no Authorization header at all. */
  as?: string;
  /** A raw Authorization header, for the malformed-token cases. */
  authorization?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface TestResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** The token format the harness's Firebase stub understands: `Bearer test:<uid>`. */
export function bearerFor(firebaseUid: string): string {
  return `Bearer test:${firebaseUid}`;
}

export function createRequest(init: TestRequestInit): VercelRequest {
  const headers: Record<string, string> = { ...init.headers };
  if (init.authorization !== undefined) headers.authorization = init.authorization;
  else if (init.as !== undefined) headers.authorization = bearerFor(init.as);

  const req = {
    method: init.method ?? 'GET',
    // The rewrite in vercel.json delivers the path as the `route` query param.
    query: { route: init.path, ...init.query } as Record<string, string>,
    body: init.body,
    headers,
    cookies: {},
    url: `/api/${init.path}`,
  };

  return req as unknown as VercelRequest;
}

export function createResponse(): { res: VercelResponse; captured: TestResponse } {
  const captured: TestResponse = { status: 0, body: undefined, headers: {} };
  // Node sends headers with the first body write and refuses a second one. The double
  // used to accept any number of writes, quietly keeping the last — which is how a test
  // could pass while production threw ERR_HTTP_HEADERS_SENT and took the invocation with
  // it. A request that answered, then had a slow handler finish afterwards, is exactly
  // that case.
  let headersSent = false;

  function write(apply: () => void) {
    if (headersSent) {
      throw Object.assign(new Error('Cannot set headers after they are sent to the client'), {
        code: 'ERR_HTTP_HEADERS_SENT',
      });
    }
    headersSent = true;
    apply();
  }

  const res = {
    get headersSent() {
      return headersSent;
    },
    status(code: number) {
      // After the response is sent, Node keeps the status it sent: assigning
      // `statusCode` later is a silent no-op, not an error. The double does the same, so
      // a late handler cannot rewrite an answer the caller already has.
      if (!headersSent) captured.status = code;
      return this;
    },
    json(payload: unknown) {
      // Serialized on purpose, exactly as Vercel's res.json does. A value JSON cannot
      // represent — a BigInt, most likely, since money is computed in minor units —
      // must fail here rather than silently pass a test and 500 in production.
      write(() => {
        captured.body = JSON.parse(JSON.stringify(payload));
      });
      return this;
    },
    send(payload: unknown) {
      write(() => {
        captured.body = payload;
      });
      return this;
    },
    setHeader(name: string, value: string) {
      captured.headers[name.toLowerCase()] = value;
      return this;
    },
    end() {
      return this;
    },
  };

  return { res: res as unknown as VercelResponse, captured };
}

export type Dispatcher = (req: VercelRequest, res: VercelResponse) => Promise<void>;

export async function call(dispatch: Dispatcher, init: TestRequestInit): Promise<TestResponse> {
  const { res, captured } = createResponse();
  await dispatch(createRequest(init), res);
  return captured;
}

/** The `data` of a successful envelope, or a readable failure naming what came back. */
export function dataOf<T>(response: TestResponse): T {
  const body = response.body as { data?: T; error?: { code: string; message: string } };
  if (body?.error) {
    throw new Error(`Expected data, got ${response.status} ${body.error.code}: ${body.error.message}`);
  }
  return body.data as T;
}

export function errorOf(response: TestResponse): { code: string; message: string; requestId: string } {
  const body = response.body as { error?: { code: string; message: string; requestId: string } };
  if (!body?.error) throw new Error(`Expected an error envelope, got ${JSON.stringify(response.body)}`);
  return body.error;
}

/**
 * Silences the request logger for a test file.
 *
 * Most of the Phase 9 suite provokes errors on purpose — a rejected token, another
 * user's row, a provider timeout — and each one legitimately writes a structured error
 * line. Left on, hundreds of them bury the one line that matters when something really
 * breaks. `logger.test.ts` covers what the logger writes; here we only stop it printing.
 */
export function silenceRequestLogs(): void {
  const spies = ['log', 'warn', 'error'] as const;
  beforeEach(() => {
    for (const level of spies) vi.spyOn(console, level).mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}
