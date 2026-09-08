/**
 * Fetch wrapper for /api/*. Attaches the caller's Firebase ID token and parses the one
 * error contract (.claude/rules/auth-security.md § Errors and logging).
 */

import { getFirebaseAuth } from './firebase';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.requestId = requestId;
  }
}

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  return typeof body === 'object' && body !== null && 'error' in body;
}

/**
 * What to say when the response was not the error contract at all.
 *
 * This is the case that produced "The string did not match the expected pattern." on
 * every card of the home screen: the response body was not JSON — a platform error page,
 * an HTML shell from a misrouted path, or an empty body — and Safari's own `JSON.parse`
 * message got rendered as though Symora had said it. The user could not act on that, and
 * it read like a bug in their own data rather than a deployment that has not been given
 * its environment variables yet.
 *
 * So the status carries the meaning, and the message says which part of the system is at
 * fault. The raw body is never shown: it can be an entire HTML page.
 */
function describeNonJsonResponse(status: number): { code: string; message: string } {
  if (status === 401 || status === 403) {
    return { code: 'UNAUTHENTICATED', message: 'Your session has expired — sign in again.' };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      message: "Symora's API isn't answering at this address. If this is a fresh deployment, check that the /api rewrite is in place.",
    };
  }
  if (status >= 500) {
    return {
      code: 'SERVER_ERROR',
      message:
        "Symora's server didn't finish that — it failed or ran out of time before answering. " +
        'The connection check under You says which part is at fault.',
    };
  }
  return { code: 'UNEXPECTED_RESPONSE', message: 'Symora got an unexpected reply from its server.' };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const idToken = await getFirebaseAuth().currentUser?.getIdToken();
  if (!idToken) {
    throw new ApiRequestError('UNAUTHENTICATED', 'You are signed out.', 'client');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    // A dropped connection, an offline device, a blocked request. The browser's own
    // wording for these is unhelpful and differs per browser, so it is not passed on.
    throw new ApiRequestError(
      'NETWORK_ERROR',
      "Symora couldn't reach its server. Check your connection and try again.",
      'client',
    );
  }

  const raw = await response.text();
  let body: unknown = null;
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      const described = describeNonJsonResponse(response.status);
      throw new ApiRequestError(described.code, described.message, 'client');
    }
  }

  if (isErrorEnvelope(body)) {
    throw new ApiRequestError(body.error.code, body.error.message, body.error.requestId);
  }

  if (!response.ok) {
    const described = describeNonJsonResponse(response.status);
    throw new ApiRequestError(described.code, described.message, 'client');
  }

  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new ApiRequestError(
      'UNEXPECTED_RESPONSE',
      'Symora got an unexpected reply from its server.',
      'client',
    );
  }

  return (body as { data: T }).data;
}
