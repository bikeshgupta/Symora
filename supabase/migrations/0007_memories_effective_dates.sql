-- 0007_memories_effective_dates.sql
-- Phase 3 — Personal memory. See .claude/rules/data-model.md § memories:
-- "Superseding a memory sets effective_to on the old row and inserts a new one; it does
-- not silently overwrite history."
--
-- 0004 created the table for Phase 2's insert-only remember_preference. Phase 3 adds
-- retrieval and superseding, which need the "one current row per memory" rule enforced
-- by a database constraint rather than a read-then-write check in application code
-- (.claude/rules/finance-rules.md § Idempotency: "Enforce uniqueness with database
-- constraints. A read-then-write check is not sufficient under concurrency.").
--
-- effective_to is an EXCLUSIVE end date: a memory applies while
-- effective_from <= as_of AND (effective_to IS NULL OR as_of < effective_to).
-- Superseding on date D therefore sets old.effective_to = D and new.effective_from = D,
-- leaving neither a gap nor an overlap.

-- Phase 2 could insert two current rows for the same key. Close the older ones before
-- adding the constraint, keeping the newest as the current value. Forward-only: this
-- repairs existing data rather than rewriting 0004.
with ranked as (
  select
    id,
    created_at,
    row_number() over (
      partition by user_id, memory_type, key
      order by created_at desc, id desc
    ) as rn
  from public.memories
  where effective_to is null
)
update public.memories m
set effective_to = greatest(m.effective_from, current_date)
from ranked r
where m.id = r.id
  and r.rn > 1;

-- The current value of a memory is unique per user, type and key. Superseded rows are
-- unconstrained, so history accumulates freely.
create unique index if not exists memories_current_key_uniq
  on public.memories (user_id, memory_type, key)
  where effective_to is null;

-- Retrieval always filters to the rows in effect, so index that access path.
create index if not exists memories_user_effective_idx
  on public.memories (user_id, effective_to, effective_from);

comment on column public.memories.effective_to is
  'Exclusive end date. NULL means the memory is still current. Superseding sets this '
  'to the date the replacement takes effect; history is never deleted or overwritten.';
