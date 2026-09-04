-- 0009_create_notifications.sql
-- Phase 8 — Notifications. See .claude/rules/data-model.md § notifications.
--
-- Notifications are *generated* from commitments and financial instances rather than
-- being a free-standing queue someone has to keep in sync: the source row is the truth,
-- and a notification is a materialised "we told the user about this once".
--
-- That is what dedupe_key is for. It encodes (source, occurrence date, kind), so
-- regenerating for the same day is idempotent — a scheduled run, a page load and a
-- retry all converge on one row rather than three copies of the same reminder
-- (.claude/rules/finance-rules.md § Idempotency: enforce with a constraint, not a
-- read-then-write check).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  -- Exactly one source is set. Both nullable because a notification may outlive neither:
  -- deleting the commitment cascades this row away with it.
  commitment_id uuid references public.commitments (id) on delete cascade,
  instance_id uuid references public.financial_instances (id) on delete cascade,

  type text not null check (type in ('due_payment', 'task', 'reminder', 'important_date')),
  title text not null,
  body text not null,

  -- The wall-clock date this notification is *for*, in the user's timezone. Stored as a
  -- date, not a timestamptz, for the same reason due_date is: it is a day the user
  -- chose, not an instant (.claude/rules/finance-rules.md § Timezone).
  scheduled_for date not null,

  status text not null default 'pending' check (status in ('pending', 'read', 'dismissed')),
  read_at timestamptz,

  -- One notification per source per occurrence per kind.
  dedupe_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notifications_one_source check (
    (commitment_id is not null and instance_id is null)
    or (commitment_id is null and instance_id is not null)
  )
);

create unique index if not exists notifications_dedupe_uniq
  on public.notifications (user_id, dedupe_key);

-- The inbox query: a user's undismissed notifications, most recent occurrence first.
create index if not exists notifications_user_status_scheduled_idx
  on public.notifications (user_id, status, scheduled_for desc);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row
  execute function public.set_updated_at();

comment on column public.notifications.dedupe_key is
  'Stable identity for one notification occurrence: source id + scheduled date + type. '
  'The unique index on it is what makes regeneration idempotent.';

-- RLS: see 0001_create_users.sql for why these are explicit deny-by-default policies
-- rather than auth.uid()-based ones (auth is Firebase, not Supabase Auth; the server's
-- service-role client does the real user_id filtering).
alter table public.notifications enable row level security;

create policy notifications_deny_anon_select on public.notifications
  for select to anon using (false);
create policy notifications_deny_anon_insert on public.notifications
  for insert to anon with check (false);
create policy notifications_deny_anon_update on public.notifications
  for update to anon using (false) with check (false);
create policy notifications_deny_anon_delete on public.notifications
  for delete to anon using (false);

create policy notifications_deny_authenticated_select on public.notifications
  for select to authenticated using (false);
create policy notifications_deny_authenticated_insert on public.notifications
  for insert to authenticated with check (false);
create policy notifications_deny_authenticated_update on public.notifications
  for update to authenticated using (false) with check (false);
create policy notifications_deny_authenticated_delete on public.notifications
  for delete to authenticated using (false);
