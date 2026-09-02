-- 0001_create_users.sql
-- Phase 1 — Foundation/Auth/DB. See .claude/rules/data-model.md § users.
--
-- Applied migrations are never edited after being applied (CLAUDE.md working
-- conventions) — a later change is always a new, higher-numbered migration.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  email text,
  display_name text,
  timezone text not null default 'Asia/Kolkata',
  preferred_language text not null default 'en'
    check (preferred_language in ('en', 'hi', 'hinglish')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is
  'The internal user record. firebase_uid is the only join point to Firebase Auth; '
  'application code resolves it to users.id once, in server middleware.';

-- Every mutable table carries an updated_at trigger (.claude/rules/data-model.md
-- § Conventions). Reused by every future table that needs it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- Row Level Security
-- --------------------------------------------------------------------------
-- Auth in this app is Firebase, not Supabase Auth: every database call is made by the
-- server using the Supabase service-role key, only after the caller's Firebase ID
-- token has been verified and user_id resolved from it (.claude/rules/auth-security.md).
-- The service role BYPASSES RLS by design, so these policies do not (and cannot)
-- enforce "user A can't see user B" by themselves — that's done by the repository
-- layer filtering explicitly on user_id. There is also no Supabase session for
-- auth.uid() to compare against here, so a permissive `auth.uid() = ...` policy would
-- be either dead code or silently wrong.
--
-- What RLS *does* provide, and why it's still enabled: a deny-by-default safety net.
-- If the Supabase anon/publishable key were ever used directly against Postgres by
-- mistake (a misconfigured client, a future feature that forgets to go through the
-- server), it must return zero rows for every user rather than leaking data through
-- an accidentally-missing policy. Explicit `using (false)` policies make that
-- guarantee auditable instead of relying on "no policy defined" being the safe state.
alter table public.users enable row level security;

create policy users_deny_anon_select on public.users
  for select to anon using (false);
create policy users_deny_anon_insert on public.users
  for insert to anon with check (false);
create policy users_deny_anon_update on public.users
  for update to anon using (false) with check (false);
create policy users_deny_anon_delete on public.users
  for delete to anon using (false);

create policy users_deny_authenticated_select on public.users
  for select to authenticated using (false);
create policy users_deny_authenticated_insert on public.users
  for insert to authenticated with check (false);
create policy users_deny_authenticated_update on public.users
  for update to authenticated using (false) with check (false);
create policy users_deny_authenticated_delete on public.users
  for delete to authenticated using (false);
