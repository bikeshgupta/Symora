-- 0010_create_audit_events.sql
-- Phase 9 — testing and hardening.
--
-- .claude/rules/data-model.md lists audit_events among the core V1 tables and
-- .claude/rules/auth-security.md requires it twice — "an authorization failure logs an
-- audit_events row", and audit_events "is append-only" — but no migration ever created
-- it, so both rules were unenforceable. This is that table.
--
-- What belongs here and what does not: an audit row records that a
-- security- or privacy-relevant thing happened, to which row, for which user. It never
-- records the content of a memory, a message, or a draft. That line is the same one
-- api/_middleware/logger.ts draws, and for the same reason — an audit trail that
-- accumulates personal data becomes a second copy of everything Symora holds, sitting
-- outside the export and the deletion path.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  -- Deliberately small. Account deletion is absent because this table cascades away
  -- with the user: a row recording the deletion would be deleted by it.
  action text not null check (
    action in ('access_denied', 'payment_corrected', 'memory_deleted')
  ),

  -- Which row the action was about. target_id is nullable because a denied access may
  -- name a resource that does not exist at all — which is exactly the case worth
  -- recording.
  target_table text,
  target_id text,

  -- Structured context, never user content: an amount that changed, a status, a method
  -- and path. Small and enumerable by design.
  detail jsonb,

  -- Ties the row to the server log line for the same request.
  request_id text,

  created_at timestamptz not null default now()
);

-- The access pattern is "what happened to this user's data, most recent first".
create index if not exists audit_events_user_id_created_at_idx
  on public.audit_events (user_id, created_at desc);

comment on table public.audit_events is
  'Append-only record of security- and privacy-relevant actions. Never updated or '
  'deleted by application code, and never carries memory, message or draft content.';

-- Append-only.
-- --------------------------------------------------------------------------
-- There is deliberately no updated_at trigger, matching ai_usage_events. The
-- application-side half of the guarantee is that the repository exposes only insert and
-- select — there is no update or delete query for this table anywhere in the codebase,
-- and a test asserts that stays true. Rows still disappear with their user, because
-- account deletion must leave nothing behind (auth-security.md § Privacy commitments);
-- an audit trail that outlived the account would defeat the deletion it recorded.

-- RLS: see 0001_create_users.sql for why these are explicit deny-by-default policies
-- rather than auth.uid()-based ones (auth is Firebase, not Supabase Auth; the server's
-- service-role client does the real user_id filtering). For this table in particular,
-- denying anon and authenticated every command is also what "append-only" means from a
-- client's point of view: nobody holding a publishable key can write, rewrite or erase
-- an audit row.
alter table public.audit_events enable row level security;

create policy audit_events_deny_anon_select on public.audit_events
  for select to anon using (false);
create policy audit_events_deny_anon_insert on public.audit_events
  for insert to anon with check (false);
create policy audit_events_deny_anon_update on public.audit_events
  for update to anon using (false) with check (false);
create policy audit_events_deny_anon_delete on public.audit_events
  for delete to anon using (false);

create policy audit_events_deny_authenticated_select on public.audit_events
  for select to authenticated using (false);
create policy audit_events_deny_authenticated_insert on public.audit_events
  for insert to authenticated with check (false);
create policy audit_events_deny_authenticated_update on public.audit_events
  for update to authenticated using (false) with check (false);
create policy audit_events_deny_authenticated_delete on public.audit_events
  for delete to authenticated using (false);
