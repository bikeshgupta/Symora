# Data model

Source of truth: `docs/Symora_V1_Requirements_and_Architecture_FULL.md` § Core V1 data
model. This file restates it as the working reference. If the two ever disagree, the
requirements document wins.

## Conventions

- Primary keys are UUIDs.
- Every user-owned table carries `user_id` referencing `users.id`, and every such table
  has an RLS policy scoping rows to the authenticated user. See
  `.claude/rules/auth-security.md`.
- Timestamps are `timestamptz` stored in UTC. Wall-clock fields the user chose
  (`due_date`, `due_time`, `due_day`, `period`) stay as `date` / `time` / text and are
  interpreted in the user's timezone. See `.claude/rules/finance-rules.md`.
- `created_at` / `updated_at` on every mutable table.
- Money is stored as `numeric`, never as a float. Currency is stored alongside it.
- Enum-like columns use Postgres enums or `text` with a check constraint — never a free
  string.

## users

| column | notes |
| --- | --- |
| `id` | uuid, primary key — the internal user id used everywhere else |
| `firebase_uid` | text, unique — links to the verified Firebase identity |
| `email` | text |
| `display_name` | text |
| `timezone` | IANA zone, e.g. `Asia/Kolkata`; drives every date computation |
| `preferred_language` | `en` \| `hi` \| `hinglish` |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

`firebase_uid` is the only join point to auth. Application code resolves it to
`users.id` once, in middleware, and passes `users.id` down.

## memories

Explicit, user-visible, editable facts. Nothing is written here implicitly.

| column | notes |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid → users.id |
| `memory_type` | e.g. `alias`, `preference`, `fact`, `correction` |
| `key` | stable lookup key for the memory |
| `value_json` | jsonb payload |
| `source` | how it was learned: `user_stated`, `confirmed`, `corrected` |
| `confidence` | numeric |
| `effective_from` | date — when the fact starts applying |
| `effective_to` | date, nullable — null means still current |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

Superseding a memory sets `effective_to` on the old row and inserts a new one; it does
not silently overwrite history.

## commitments

The umbrella table for everything the user has committed to. Payments, tasks,
reminders, and important dates are all commitments.

| column | notes |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid → users.id |
| `type` | `PAYMENT` \| `TASK` \| `REMINDER` \| `IMPORTANT_DATE` |
| `title` | text |
| `description` | text |
| `due_date` | date |
| `due_time` | time, nullable |
| `recurrence_rule` | text, nullable — recurring definition, not a materialized schedule |
| `status` | e.g. `pending`, `done`, `cancelled` |
| `priority` | e.g. `low`, `normal`, `high` |
| `source` | `chat`, `voice`, `paste`, `manual` |
| `created_at` | timestamptz |
| `updated_at` | timestamptz |

## financial_obligations

The recurring *definition* of a payment. Never mutated to record a payment.

| column | notes |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid → users.id |
| `commitment_id` | uuid → commitments.id |
| `account_name` | text, e.g. "Home loan" |
| `obligation_type` | e.g. `emi`, `rent`, `bill`, `subscription`, `insurance` |
| `amount` | numeric — the expected recurring amount |
| `currency` | ISO 4217 code |
| `due_day` | int — day of month the obligation falls due |
| `recurrence_rule` | text |

## financial_instances

One row per period per obligation. This is where payment history lives.

| column | notes |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid → users.id |
| `obligation_id` | uuid → financial_obligations.id |
| `period` | the period key, e.g. `2026-09`; unique together with `obligation_id` |
| `expected_amount` | numeric — snapshotted from the obligation when the instance is created |
| `paid_amount` | numeric, nullable |
| `status` | `pending` \| `paid` \| `partial` \| `skipped` \| `overdue` |
| `paid_date` | date, nullable |

`(obligation_id, period)` must be unique — this constraint is what makes marking a
payment idempotent. See `.claude/rules/finance-rules.md`.

## conversations

Chat threads. Holds `id`, `user_id`, a title/summary, and timestamps.

## messages

Individual turns within a conversation: `id`, `user_id`, `conversation_id`, role
(`user` / `assistant`), the raw text, detected language, the resolved intent, and
timestamps. Voice turns store the raw transcript.

## ai_usage_events

One row per AI provider call for quota and cost tracking: `id`, `user_id`, provider,
model, request/response token counts, estimated cost, the intent it served, and
`created_at`.

## notifications

Scheduled and delivered user notifications: `id`, `user_id`, the source commitment or
instance, type, scheduled time, delivery state, and timestamps.

## audit_events

Append-only record of security- and privacy-relevant actions: `id`, `user_id`, action,
target table and row, and `created_at`. Never updated or deleted by application code.

## Rules for changing the model

- Every schema change is a new versioned migration in `supabase/migrations/`. Applied
  migrations are never edited.
- A migration that creates a user-owned table must enable RLS and add its policy in the
  same migration.
- Never widen a column to accept a client-supplied `user_id`.
- Do not add tables for Future / V2 / V3 features. Interfaces may anticipate them; the
  schema should not.
