/**
 * Request context (.claude/rules/auth-security.md § Identity): resolves the verified
 * Firebase identity to a users.id exactly once, so every downstream handler reads
 * user_id from here instead of re-deriving it or, worse, accepting it from the client.
 */

import type { VercelRequest } from '@vercel/node';
import { getOrCreateUserByFirebaseUid, getSupabaseServiceClient, type UserRecord } from '@symora/core';
import { verifyBearerToken } from './firebase-admin';
import { createLogger, type Logger } from './logger';

export interface RequestContext {
  requestId: string;
  user: UserRecord;
  logger: Logger;
}

export async function buildRequestContext(
  req: VercelRequest,
  requestId: string,
): Promise<RequestContext> {
  const decoded = await verifyBearerToken(req.headers.authorization);

  const client = getSupabaseServiceClient();
  const user = await getOrCreateUserByFirebaseUid(client, {
    firebaseUid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
  });

  return { requestId, user, logger: createLogger({ requestId, userId: user.id }) };
}
