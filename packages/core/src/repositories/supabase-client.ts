/**
 * The Supabase service-role client. Server-only — see .claude/rules/auth-security.md.
 * Bypasses RLS by design; every repository function using this client MUST filter
 * explicitly by user_id itself. RLS is the safety net for a bug here, not a substitute.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Never fall back to a ' +
        'default or anonymous client for server-side data access.',
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
