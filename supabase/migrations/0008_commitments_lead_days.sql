-- 0008_commitments_lead_days.sql
-- Phase 4 — Commitments + finance + tasks/reminders. PROGRESS.md lists "lead-time
-- preference" under Reminders: "Remind me 2 days before every bill."
--
-- The lead time belongs on the commitment, not on a separate reminders table: a
-- reminder IS a commitment (.claude/rules/data-model.md § commitments), and the lead
-- time is a property of that specific reminder rather than a standing user setting.
-- Standing preferences live in `memories` and are set through remember_preference.
--
-- Nullable, because most commitments have no lead time. NULL means "fire on the due
-- date"; 2 means "two days before it". The fire date is computed in code from due_date
-- and this column (domain/commitments/recurrence.ts) — never stored, so changing the
-- due date cannot leave a stale fire date behind.

alter table public.commitments
  add column if not exists lead_days integer
    check (lead_days is null or (lead_days >= 0 and lead_days <= 365));

comment on column public.commitments.lead_days is
  'Days before due_date to surface this commitment. NULL means on the due date itself. '
  'The resulting fire date is always computed, never stored.';
