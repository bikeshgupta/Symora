# Finance rules

Principle 6: **finance calculations are deterministic.** Phase 4 acceptance requires
deterministic totals, recurring definitions kept separate from monthly history,
idempotent updates, and correct timezone handling. This file is how that is achieved.

## The central separation: obligation vs instance

There are two distinct concepts, and conflating them is the single most damaging
mistake in this domain.

**`financial_obligations` — the recurring definition.**
"Home loan, ₹42,500, due on the 5th, every month." It describes what recurs. It is
edited only when the arrangement itself changes (the EMI amount changes, the due day
moves, the obligation ends). It carries no payment state.

**`financial_instances` — one occurrence in one period.**
"Home loan, September 2026, expected ₹42,500, paid ₹42,500 on the 5th." This is where
`status`, `paid_amount`, and `paid_date` live. Payment history is a series of instances.

Rules that follow from this:

- Marking a payment writes to an **instance**, never to the obligation.
- Changing the obligation's amount **does not** retroactively change past instances. Each
  instance snapshots `expected_amount` at creation, so history stays truthful.
- Deleting or ending an obligation must not delete its historical instances.
- An instance is never created without an obligation. `(obligation_id, period)` is unique.
- Never store a computed total as a column. Totals are always derived from instances.

## Determinism

- No AI in any arithmetic path. The model may extract "42500", "5th", "monthly" from a
  sentence — the model never computes a sum, a due date, an overdue count, or a monthly
  requirement. Once extracted values are confirmed, arithmetic happens in code.
- The same stored rows plus the same "as of" instant must always produce the same
  output. Same inputs, same result, every time.
- Pass the current time in explicitly as a parameter to calculation functions. Never
  call `Date.now()` (or equivalent) inside one — that makes it untestable and
  non-reproducible.
- Money is `numeric` in the database and handled as integer minor units or a decimal
  type in code. **Never floating point arithmetic on money.**
- Never mix currencies in a total. Group by currency; if a single total is genuinely
  required across currencies, that is a product decision, not an implicit conversion.
- Rounding rules are stated once, in one place, and applied consistently. Round only at
  presentation, not between intermediate steps.
- Every calculation function is a pure function over its inputs and covered by unit
  tests with fixed dates.

## Canonical calculations

- **Monthly required total** — sum of `expected_amount` across the instances for that
  period, for that user, in that currency. Derived from instances, not from obligations,
  so a skipped or amended instance is reflected correctly.
- **Pending / outstanding** — instances whose `status` is `pending`, `partial`, or
  `overdue`. For a partial payment, outstanding is `expected_amount - paid_amount`.
- **Upcoming payments** — pending instances whose computed due date falls within the
  requested window, ordered by due date.
- **Overdue** — pending instances whose due date is strictly before "today" in the
  user's timezone.

## Instance generation

- Instances are generated from the obligation's `recurrence_rule` and `due_day`,
  deterministically, for a bounded window. Never generate an unbounded series.
- Generation is idempotent: running it twice for the same period produces one instance,
  enforced by the unique `(obligation_id, period)` constraint, not merely by a
  pre-check.
- Short months: an obligation with `due_day` 31 falls due on the last day of a month that
  has fewer days. Clamp — never roll into the next month. This rule is stated once and
  tested.
- Generating instances must never overwrite or reset an existing instance's payment
  state.

## Idempotency

- Every write path assumes it may be delivered twice — a retried request, a double tap,
  a re-sent voice command.
- Marking an instance paid is idempotent: marking an already-paid instance with the same
  amount and date is a no-op returning success, not a duplicate row and not an error.
- Marking paid with a *different* amount is a correction, not a duplicate: it updates
  the instance and records an audit event.
- Enforce uniqueness with database constraints. A read-then-write check is not
  sufficient under concurrency.
- Mutations that span multiple rows run in a transaction.

## Timezone

- Every user has a `timezone` (IANA, e.g. `Asia/Kolkata`) on their row. All date logic
  uses it.
- "Today", "tomorrow", "this month", "kal", "next week", and overdue checks are resolved
  **in the user's timezone**, never in server local time and never in UTC.
- Server timezone is irrelevant and must never be relied on. Tests run under a
  non-UTC, non-user timezone to catch accidental dependence.
- `due_date` and `due_time` are wall-clock values the user chose. Store them as `date` /
  `time` and interpret them in the user's zone. Do not convert them to a UTC instant on
  write.
- Event timestamps (`created_at`, `updated_at`, notification send times) are `timestamptz`
  in UTC and converted for display only.
- `period` is a calendar month key, e.g. `2026-09`, derived in the user's timezone.
- A payment made at 11pm on the 5th in Kolkata belongs to the 5th, not the 6th.

## Scope boundary

V1 finance is: recurring obligations, monthly instances, due dates, paid/pending state,
amount and date, monthly required total, and upcoming payments.

Not V1: financial advisory, projections, budgeting recommendations, advanced history and
analytics, or any automated bank/SMS reading. Do not build these unless explicitly asked.
