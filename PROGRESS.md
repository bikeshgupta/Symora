# Symora — Progress

Phase-by-phase build tracker. Source of truth for scope and acceptance criteria:
`docs/Symora_V1_Requirements_and_Architecture_FULL.md`.

**Overall status: Phases 1-9 complete**, subject to the live verification listed under
each phase — the whole suite runs without a Firebase project, a Supabase project or an AI
key, which is a strength for CI and a limit on what it can prove.

**Symora runs with no AI provider key.** Every deterministic feature works either way;
the language layer falls back to a rule-based parser, drafts to templates, and voice to
the browser's own recogniser. See "Offline mode" below.

| Phase | Status | Estimate |
| --- | --- | --- |
| 0 — Skeleton and memory files | Done | — |
| 1 — Foundation / Auth / DB | Done | 10h |
| 2 — Core Ask Symora + AI pipeline | Done | 15h |
| 3 — Personal memory | Done | 12h |
| 4 — Commitments + finance + tasks/reminders | Done | 20h |
| 5 — Paste/share + drafting + WhatsApp/email | Done | 10h |
| 6 — Personalized home + small dynamic UI | Done | 10h |
| 7 — Voice + Hindi/Hinglish | Done | 10h |
| 8 — Notifications + usage + privacy basics | Done | 8h |
| 9 — Testing / hardening | Done | 15–25h |

Total target: ~110–120h.

Update this file as items are completed. Tick a box only when the work is done and
verified — not when it is merely written.

---

## Phase 1 — Foundation / Auth / DB — 10h — Built, pending live verification

Build:

- [x] Repo structure
- [x] React / Vite / TypeScript
- [x] Tailwind / shadcn (hand-written shadcn-style primitives — CLI needs network access
      this session didn't have; same conventions, swap for CLI-generated ones anytime)
- [x] Design tokens as CSS variables on `:root` and `.dark`
- [x] Tokens wired into the Tailwind theme extension (`darkMode: 'class'`)
- [x] Mukta font loaded with both `latin` and `devanagari` subsets (Google Fonts serves
      both automatically via `unicode-range`); tabular figures **not yet verified** —
      needs a real browser check
- [x] Theme switching: system preference on first load, user override persisted,
      applied pre-paint
- [x] Lint rule failing the build on raw palette classes and hex literals in `.tsx`
      (`eslint.config.js`, `local/no-raw-palette`)
- [x] PWA base (`vite-plugin-pwa`, manifest, svg icons)
- [ ] Vercel setup — `vercel.json` is written; the user still needs to create/link the
      actual Vercel project
- [x] Firebase Auth (client: Google + email/password)
- [x] Firebase Admin server verification (`api/_middleware/firebase-admin.ts`)
- [ ] Supabase project and schema — migration SQL is written
      (`supabase/migrations/0001_create_users.sql`); the user still needs to create the
      actual Supabase project and apply it
- [x] RLS (`users` table; see the migration's RLS comment for the reasoning — Firebase
      auth means the service role does the real filtering, RLS is a deny-by-default
      safety net for `anon`/`authenticated`)
- [x] Server-only secrets (`.env.example` already documented this; verified no
      non-`VITE_` value is read from `apps/web`)
- [x] API error contract (`api/_middleware/errors.ts`)
- [x] Logging convention (`api/_middleware/logger.ts`)
- [x] Feature flags (`packages/core/src/config/feature-flags.ts`)
- [x] Migrations (`supabase/migrations/0001_create_users.sql`, versioned, forward-only)

Acceptance — none of these are checked yet; they need real Firebase/Supabase/Vercel
credentials and a live run, which this session couldn't provision:

- [ ] Login works
- [ ] `/api/me` returns the verified user
- [ ] User A cannot query User B (only one resource, `/api/me`, exists so far — this
      gets a real test once Phase 4 adds multi-row resources)
- [ ] Vercel deploy works
- [x] Migrations are versioned
- [x] No server secret reaches the frontend (`apps/web` only reads `VITE_`-prefixed env
      vars; server secrets live in `api/`/`packages/core`, never imported by `apps/web`)
- [ ] Both themes render correctly and no theme flash on load — needs a real browser
      check

## Phase 2 — Core Ask Symora + AI pipeline — 15h — Built, pending live verification

Build:

- [x] Ask Symora text input (`apps/web/src/components/ChatPanel.tsx`, in `HomePage`)
- [x] Basic chat history (`conversations`/`messages` tables + `/api/chat`)
- [x] AIProvider abstraction — real OpenAI implementation
      (`packages/core/src/adapters/openai-provider.ts`), model ids read from
      `AI_MODEL_CHEAP`/`AI_MODEL_STRONG` so this file doesn't go stale as models change
- [x] Language detection (`ai/orchestrator/language.ts`, heuristic — Devanagari range +
      a romanized-Hindi function-word list, no AI call)
- [x] Domain routing + intent/entity extraction — one structured call via native tool
      calling (`ai/orchestrator/intent-extraction.ts`)
- [x] Confidence handling (`ai/orchestrator/confidence-risk.ts` — the two independent
      gates from the rules file, unit tested)
- [x] Typed tool registry (`ai/tools/registry.ts`, all 12 intents, Zod-validated,
      no tool accepts `user_id`)
- [x] Structured response format (`{ data: { conversationId, message, ui } }`; `ui` is
      typed against the eventual Phase 6 allowlist but only ever a functional
      `confirmation-prompt` stand-in for now — the real `ConfirmationCard` is Phase 6)

Also required to make the acceptance examples actually work (see PROGRESS/plan note):
`commitments`, `financial_obligations`, `financial_instances`, and `memories` tables
(migrations `0002`–`0004`) and their deterministic domain services, including the
finance-rules.md idempotency/due-day-clamping/no-floating-point rules — unit tested.
Dedicated REST endpoints for these (`/api/commitments`, `/api/finance`, ...) are still
Phase 4 — only `/api/chat` exists so far.

Initial intents — all twelve are registered and routed through the pipeline above:

- [x] `create_commitment` (important dates)
- [x] `create_task`
- [x] `create_reminder`
- [x] `create_financial_obligation` (always confirms — high-impact write)
- [x] `mark_paid` (always confirms; idempotent — re-marking the same amount/date is a
      no-op, a different one is a correction)
- [x] `mark_done`
- [x] `reschedule`
- [x] `list_pending`
- [x] `calculate_monthly_requirement`
- [x] `remember_preference` (plain insert — retrieval/aliases/corrections are Phase 3)
- [x] `draft_message` (both variants in one AI call, per the rules file)
- [x] `interpret_pasted_message` (always confirms whatever action the pasted text
      implies, regardless of the nested extraction's own confidence)

Acceptance examples — all five now asserted end-to-end **in offline mode**, which is the
mode the pilot runs in: intent, extracted args and resolved dates, against a fixed clock,
with no provider and no network (`ai/offline/offline-corpus.test.ts`). Still not
exercised against a live model or a live Supabase project.

- [x] "Home loan 42500 every month on 5th." → `create_financial_obligation`, "Home loan",
      ₹42,500, due day 5, monthly
- [x] "Saturday electrician ko call karna." → `create_task`, "electrician call",
      2026-09-12
- [x] "Remind me 2 days before every bill." → `create_reminder`, "bill", 2 lead days
- [x] "This month what all is pending?" → `list_pending`, ALL
- [x] "Home loan kal pay kar diya." → `mark_paid`, "Home loan", yesterday
- [ ] The same five through a live model — Phase 9, once a key is added

## Phase 3 — Personal memory — 12h — Done

Build:

- [x] Explicit memory storage — written only via `remember_preference` or an explicit
      user edit, never as a side effect of another intent
- [x] Aliases — `memoryType: 'alias'`, keyed on the nickname itself
- [x] Preferences
- [x] Correction memory — a statement that replaces an earlier value is recorded with
      `source: 'corrected'` and names what it replaced
- [x] Relevant-memory retrieval — deterministic scoring in
      `domain/memory/relevance.ts`, no second AI call
- [x] "What Symora knows about me" — `MemoryPanel`, backed by `GET /api/memories`
- [x] Edit / delete memory — `PATCH` / `DELETE /api/memories/:id`
- [x] Effective-date support — `effective_to` is an exclusive end date; superseding
      closes the old window and inserts a new row, enforced by a partial unique index
      (migration 0007)

Acceptance:

- [x] Learned information reduces repeated clarification — relevant memories are loaded
      before extraction and rendered as fenced reference data, so the model resolves
      "mummy" or a known lead time instead of asking again

Not yet verified against a live database: the migration and the repository queries have
not been run against a real Supabase project in this session. See the note in Phase 9
about a memory-service integration test.

## Phase 4 — Commitments + finance + tasks/reminders — 20h — Done

Commitment umbrella — one table, one service, filtered views (`/api/commitments`,
`/api/tasks`, `/api/reminders`):

- [x] Payments — created through the finance service only; `commitmentsService.create`
      refuses a bare PAYMENT so no obligation-less payment row can exist
- [x] Tasks
- [x] Reminders
- [x] Important dates

Finance V1 (`/api/finance`, `/api/finance/obligations`, `/api/finance/instances`):

- [x] Recurring obligations — the definition, never mutated to record a payment
- [x] Monthly instances — bounded, idempotent generation (`domain/finance/instances.ts`,
      capped at 24 periods, writes only the gaps)
- [x] Due dates — clamped to the last day of short months
- [x] Paid / pending — plus partial, skipped, and derived overdue
- [x] Amount / date
- [x] Monthly required total — summed in exact minor units, grouped by currency
- [x] Upcoming payments

Tasks:

- [x] Create · due date/time · priority · status · mark done · reschedule
      (`PATCH /api/commitments/:id`)

Reminders:

- [x] One-time
- [x] Recurring — yearly, monthly and weekly next-occurrence
- [x] Lead-time preference — `lead_days` (migration 0008); the fire date is computed
      from due date + lead time, never stored

Important dates:

- [x] Birthdays · anniversaries · renewal dates, with annual recurrence. Feb 29 clamps
      to Feb 28 in a non-leap year rather than rolling into March

Acceptance:

- [x] Finance totals deterministic — every figure derived from stored instances at read
      time, exact minor-unit arithmetic, `now` always passed in
- [x] Recurring definition separate from monthly history — obligations vs instances,
      and the UI mirrors the split
- [x] Idempotent updates — re-marking the same amount and date is a no-op; generation
      only fills gaps and relies on the unique `(obligation_id, period)` constraint
- [x] Correct timezone handling — "today" and the period key resolve in the user's
      timezone; date arithmetic works on `YYYY-MM-DD` strings rather than local `Date`
      objects, which would shift the day for anyone west of UTC

Not verified against a live database or a real OpenAI key — see the Phase 9 follow-ups.

## Phase 5 — Paste/share + drafting + WhatsApp/email — 10h — Done

Paste-to-Symora (`PastePanel` → `/api/chat`) — categorised deterministically, then
interpreted; the proposed action always requires confirmation because pasted
third-party content is high-impact by definition:

- [x] Payment confirmation
- [x] Appointment
- [x] Booking confirmation
- [x] Renewal message
- [x] Other useful text — falls back to `other` rather than guessing

Message drafting (`/api/drafts`):

- [x] Generate 2 variants in one AI call (short, and warm/detailed)
- [x] Use known relationship / context when available — relevant memories are retrieved
      and folded into the recipient context

Handoff:

- [x] One-tap WhatsApp — `wa.me` link with prefilled text, built by a pure function
      (`adapters/whatsapp-adapter.ts`). No WhatsApp Business API; Symora never sends
- [x] One-tap email — `mailto` prefill (`adapters/mailto-adapter.ts`)
- [x] Share-to-Symora — `MessagingAdapter` / `EmailAdapter` interfaces carry the shape a
      native share extension would implement later; no extension is built

## Phase 6 — Personalized home + small dynamic UI — 10h — Done

Home — one `GET /api/home` call, all of it computed server-side by
`domain/home/home-service.ts`:

- [x] Greeting — part of day resolved from the wall-clock hour in the user's timezone
- [x] Needs Attention — ranked, capped at 5, total ordering so it never reshuffles
- [x] Upcoming payment
- [x] Today task
- [x] Important date — surfaced 14 days ahead
- [x] Overdue item — ranked above everything else
- [x] Contextual suggestions — chosen from what is actually on screen; tapping one fills
      the Ask Symora input rather than executing, so a chip cannot bypass confirmation
- [x] Ask Symora input

Trusted V1 UI components (`apps/web/src/components/trusted/`):

- [x] `AttentionCard`
- [x] `PaymentSummary`
- [x] `CommitmentList`
- [x] `TaskList`
- [x] `ConfirmationCard`
- [x] `MessageDraftCard`
- [x] `SuggestionChip`

Component rules (see `.claude/rules/design-system.md`):

- [x] All seven share one `CardShell` — same radius, padding rhythm, and elevation.
      `SuggestionChip` is the documented exception (pill, recedes)
- [x] Status communicated by colour **and** text or icon — `StatusPill` makes `label` a
      required prop, so a bare coloured dot cannot be built
- [x] `ConfirmationCard` visually distinct — the 2px primary border via CardShell's
      `gated` emphasis, which nothing else uses
- [x] `ConfirmationCard` lets the user correct a misparse before approving it. Each field
      now carries the argument key it came from and an editor kind (`text` / `number` /
      `date`, an allowlist like the component names themselves), so an edit can be written
      back into the tool call. Extraction is **not** re-run — the corrected arguments are
      what the user approves and what executes, and the server validates them against the
      same tool schema, which it already did for every confirmation. Added because offline
      parsing is pattern-based: a wrong account name should cost one edit, not a retyped
      sentence and a second guess.
- [ ] Every screen checked in both light and dark themes — **needs a real browser**;
      tokens are wired, but no one has looked at it

- [x] Avoid a generic dashboard — the home ranks and caps rather than listing everything

## Phase 7 — Voice + Hindi/Hinglish — 10h — Done

Build:

- [x] Push-to-talk — `useVoiceInput`, MediaRecorder with a negotiated mime type
- [x] Speech-to-text — `openAiSpeechAdapter` behind the `SpeechAdapter` interface;
      `POST /api/voice/transcribe`
- [x] Raw transcript — returned unedited and shown to the user before anything acts on
      it; transcription and interpretation are two separate steps on purpose
- [x] Language detection — extended from the NLP corpus (see below)
- [x] Hindi / Hinglish interpretation — the extraction prompt now carries temporal
      anchors computed in code, so "kal", "Saturday" and "agle 5 din" resolve against
      real dates in the user's timezone instead of the model guessing what today is
- [x] Confirmation for ambiguous sensitive values — a voice turn carrying a monetary
      amount always confirms (`requiresSourceConfirmation`), and an ambiguous relative
      date with no tense to settle it clarifies rather than guessing

Acceptance — the deterministic halves (language, ambiguity, the risk gate) are asserted
in `ai/orchestrator/nlp-corpus.test.ts`; which intent the model picks still needs a live
key:

- [x] "Kal wali EMI bhar diya." — detected Hinglish, past tense settles "kal"
- [x] "Saturday electrician ko call karna yaad dila dena." — detected Hinglish
- [x] "Agle 5 din me kitna payment baki hai?" — detected Hinglish
- [ ] End-to-end through a live OpenAI key — not run

NLP regression corpus started at `ai/orchestrator/nlp-corpus.test.ts`, covering both
phases' acceptance phrases. It already earned its keep: "parso appointment" was being
detected as English because no marker in it was listed.

## Phase 8 — Notifications + usage + privacy basics — 8h — Done

Notifications (`domain/notifications/`, migration 0009, `/api/notifications`):

- [x] Due payment — fires on the due date and every day it stays late; a partial payment
      is chased for the remainder
- [x] Task
- [x] Birthday — via important dates, off the next occurrence rather than the anchor
- [x] Reminder — honours `leadDays`, so "2 days before" fires on the lead date *and* the
      due date

Generation is derived from commitments and instances, not queued ahead, and is
idempotent via a unique `dedupe_key` of (source, type, date). V1 has no scheduler, so
generation runs on every read of the inbox and the app catches up when opened; a
background job can call the same service later without producing duplicates.

- [ ] Push delivery — **not built.** Notifications are in-app only. Web Push needs a
      service worker subscription and VAPID keys, which is a deployment decision, not
      code this phase should have guessed at.

Usage (`/api/usage`):

- [x] Requests
- [x] Tokens
- [x] Estimated cost
- [x] User allowance — `AI_MONTHLY_REQUEST_ALLOWANCE`; unset means unlimited, not zero
- [x] Reset date — first of next month in the user's timezone

Privacy (`/api/privacy/export`, `/api/privacy/delete`, `PrivacyPanel`):

- [x] View memories
- [x] Delete memory
- [x] Export data — one JSON file, served as a download, opening with a plain statement
      of what Symora does and does not collect
- [x] Delete account — one delete cascading from `users` across every table, so it is
      atomic; requires the user to type DELETE. The Firebase auth user is not removed —
      that is a separate system and the client signs out instead
- [x] Clear data-access wording — stated in the panel next to the controls
- [x] Privacy principle honoured
- [x] SMS is not read automatically in V1

## Offline mode — running without an AI provider

Added alongside Phase 8 so the app can be piloted before any AI subscription exists.
`getAiMode()` reads configuration only (never a request) and needs both `OPENAI_API_KEY`
and `AI_MODEL_CHEAP` to leave offline mode.

Unchanged without a key — these never involved AI:

- [x] Auth, profile, the home screen and its ranking
- [x] Commitments, tasks, reminders, important dates
- [x] Finance: obligations, instances, totals, mark paid, overdue
- [x] Memory: add, list, edit, delete, effective-dated superseding
- [x] Notifications, usage, export, delete
- [x] WhatsApp and email handoff links

Substituted without a key:

- [x] Intent extraction → `ai/offline/rule-parser.ts`, a pattern matcher covering the
      twelve V1 intents in English and Hinglish. It reports honest confidence, so a
      partial match falls below the threshold and the pipeline asks instead of writing.
      Its output is validated against the same tool schemas the model path uses.
- [x] Relative dates and amounts → `ai/offline/date-parser.ts` and `amount-parser.ts`.
      The amount parser refuses to read a day-of-month or a lead time as money.
- [x] Message drafting → `ai/offline/template-drafter.ts`. Two variants, same handoff,
      and the UI says they are templates.
- [x] Voice → the browser's Web Speech API, on-device, no key. Chrome and Edge only;
      Firefox hides the mic rather than offering something that fails.
- [x] The UI says which mode it is in (`ModeBanner`), rather than letting a pilot user
      conclude the understanding is simply poor.

Audited against the code rather than the checklist, and fixed:

- [x] `draft_message` reached through a chat turn went straight to the provider in every
      mode — `handleDraftMessage` in `ai/tools/registry.ts` never consulted `getAiMode()`,
      so with no key it threw out of `runTool` and 500'd `/api/chat`, while the identical
      request through `/api/drafts` was answered from templates. It now takes the same
      offline path.
- [x] A configured-but-failing provider had no path at all: the error escaped `/api/chat`
      as a 500, which is worse than configuring nothing. Extraction now falls back to the
      rule parser (`ai/orchestrator/resilient-extraction.ts`), logs the real cause, and
      says so in the reply rather than blaming the user's phrasing.
- [x] Structure the parsers had already consumed was surviving into user-visible titles:
      "Home loan 42500 every month on 5th" produced an account named "Home loan month
      5th", and "Kal doctor appointment hai" a task titled with its own date. `cleanTitle`
      stripped the canonical phrase case-sensitively and only once, so a capitalised "Kal"
      never matched; the due day and lead time had no stripper at all. Fixed with
      `stripPhrase`, `stripDueDay` and `stripLeadDays`, and locked in by the corpus test.
- [x] Blank env vars read as zero rather than absent — `AI_REQUEST_TIMEOUT_MS=` became a
      0 ms SDK timeout that would abort every request the moment a key was added
      (`readTimeoutMs` in `adapters/openai-provider.ts`).

Known limits of offline mode, stated rather than hidden:

- Memory does not inform extraction — the rule parser matches patterns, not context, so
  "mummy ko call karna" does not resolve to Sunita. Memory itself is unaffected.
- Phrasings far from the documented examples fall through to a message explaining what
  Symora understands, rather than to a wrong write.
- Paste interpretation categorises and routes to confirmation, but extracts less from
  the pasted text than a model would.

## Phase 9 — Testing / hardening — 15–25h — Done

599 tests across 47 files. The whole suite runs with no Firebase project, no Supabase
project, no AI key and no network — see "What the suite cannot prove" at the end of this
section for what that costs.

### The harness

Most of what Phase 9 has to prove — user isolation, idempotency, cascade deletion — is
only true of real rows and real queries, and mocking the repositories would prove none of
it: a mock agrees with whatever the caller expects. So the suite substitutes the driver,
not the code.

- [x] `packages/core/src/testing/fake-supabase.ts` — an in-memory stand-in for the
      Supabase client implementing the slice of PostgREST the repositories actually use:
      the filter set, ordering with Postgres' null placement, `single`/`maybeSingle`,
      `upsert` with `onConflict`, count with `head`, numeric returned as a string, real
      unique constraints raising 23505, real cascade deletes, and injectable table
      failures for the connection-lost cases.
- [x] `packages/core/src/testing/schema.ts` — a hand-written mirror of the migrations,
      held to them by `migrations.test.ts`. A new constraint or cascade has to be
      reflected there or the suite goes red; a fake allowed to drift tests nothing.
- [x] `api/_testing/` — request/response doubles that drive `api/index.ts` the way Vercel
      does. Only Firebase's network call and the Supabase client are substituted;
      routing, auth middleware, handlers, services and repositories are the shipping
      code. `res.json` serializes, so a value JSON cannot represent fails at the boundary
      instead of passing a test and 500ing in production.

### Test

- [x] Auth — seven malformed-token shapes, each 401 with nobody provisioned; every route
      in the table guarded; a spoofed `user_id` in body, query or header ignored on read
      and on write; provisioning idempotent on `firebase_uid`; the failure reason never
      in the response
      (`api/_tests/auth.test.ts`, `api/_middleware/firebase-admin.test.ts`)
- [x] RLS — the migrations are read and audited: RLS enabled in the same migration that
      creates the table, a policy per command per client role, no permissive predicate,
      `user_id` cascading from `users`, nothing dropped, versions gap-free
      (`packages/core/src/testing/migrations.test.ts`)
- [x] Cross-user access — at two levels, because one is not enough. Through the real API
      (`api/_tests/cross-user.test.ts`): Alice and Bob both seeded through the endpoints,
      ten collections showing neither the other's rows nor the other's user id, an item
      read answering a 404 whose body is byte-identical to a genuinely missing row, and
      six write paths changing nothing. And at the repository boundary
      (`packages/core/src/repositories/cross-user.test.ts`), one query at a time — eight
      single-row reads, thirteen list reads and ten write paths, each called as the wrong
      user. The second file exists because the first missed something: deleting the
      `user_id` filter from `getMemoryById` left every API test green, since the *second*
      query on the same path still filtered and turned the result into a 404. Defence in
      depth working, and a mutation escaping unnoticed all the same. Both were
      mutation-checked — removing a `user_id` filter from any read or write now fails.
- [x] Duplicate writes — double-tapped mark-paid, racing instance generation, repeated
      inbox reads, restated memories, re-marking a task done
      (`api/_tests/idempotency.test.ts`,
      `packages/core/src/domain/finance/finance-integration.test.ts`)
- [x] Timezone — the suite runs under `America/Los_Angeles` (`vitest.config.ts`) while
      the fixtures live in `Asia/Kolkata`, so anything leaking the server's zone lands on
      the wrong calendar day. A payment at 11pm on the 5th in Kolkata belongs to the 5th;
      the period rolls at the user's midnight; overdue is decided against the user's today
- [x] Recurring finance — short-month clamping, the `expected_amount` snapshot surviving
      an EMI change, bounded generation, per-currency totals never mixed, a summary that
      is byte-identical twice for the same rows and instant
- [x] Speech ambiguity — a voice-dictated amount always confirms and shows the parsed
      figure verbatim; a correction typed on the card is what executes, without
      re-extraction; a tenseless "kal" is asked about rather than guessed
      (`api/_tests/speech-ambiguity.test.ts`)
- [x] Hindi / Hinglish — nine more rows in the offline corpus and eight in the
      orchestrator corpus, every one run against the parser before being written down
- [x] Malformed AI output — an unregistered tool name, a required field missing, an
      amount as words, a model-supplied `user_id`, and a tool call with no arguments at
      all (`api/_tests/ai-failure.test.ts`)
- [x] Provider timeout / failure — timeout, connection failure, bad key and provider
      outage each answer 200 with the built-in parser standing in
- [x] Network failure — the AI provider unreachable, and the database unreachable: the
      one error contract, no host/port/driver text in the response, no partial answer
      served as if it were whole (`api/_tests/resilience.test.ts`)
- [x] Quota exhaustion — both senses. The provider's own 429, and Symora's monthly
      allowance, which is now enforced rather than merely displayed (see below)
- [x] Notifications — one row per source per day however often the inbox is read, a
      dismissal not resurrected, a lead time firing early *and* on the day, daily while
      overdue, dated by the user's day
      (`packages/core/src/domain/notifications/notification-integration.test.ts`)
- [x] Data deletion / export — the export covers every category and none of another
      user's, omits `firebase_uid`, includes superseded memories, and serializes.
      Deletion is checked by walking every table in the schema rather than naming a few,
      with a companion test proving the fixture had rows in each
      (`packages/core/src/domain/privacy/privacy-service.test.ts`)
- [x] Maintain an NLP regression corpus of messy real user phrases — started in Phase 7
      (`ai/orchestrator/nlp-corpus.test.ts`, `ai/offline/offline-corpus.test.ts`); keep
      adding a row per real parsing bug

### What Phase 9 found and fixed

- [x] `InstanceState.outstandingMinorUnits` was a `bigint` and flowed straight into the
      response body. `JSON.stringify` throws on BigInt, so `GET /api/finance` and
      `GET /api/finance/instances` would have 500'd on any account with an obligation.
      Now a decimal string, matching `MonthlyRequirementBreakdown.totalMinorUnits`.
- [x] A missing `FIREBASE_*` env var was reported as `UNAUTHENTICATED` — telling the user
      to sign in again for a fault signing in cannot fix. Initialization now sits outside
      that catch and reports `INTERNAL_ERROR`, with the real reason on `cause`.
- [x] A tool call whose arguments failed its Zod schema reached `runTool`'s strict parse
      and became a 500. `validateToolArgs` now rejects it first and the reply names the
      missing fields. Invalid arguments were always meant to be a rejected tool call
      rather than a coerced one; now they are also not a crash.
- [x] The offline parser answered Devanagari input with an English "I didn't catch an
      action" and English examples. Its patterns are Latin-script, so Hindi in Devanagari
      cannot match them at all and the user would have rephrased forever against a limit
      that is ours. It now replies in Hindi, says the built-in parser reads Roman script,
      and gives examples that work; Hinglish gets a Hinglish reply.
- [x] First-person framing leaked into user-visible fields — "maine rent de diya 15000"
      produced an account named "maine rent", which is then what a confirmation card
      offers to save.
- [x] `audit_events` did not exist. `auth-security.md` requires an audit row on an
      authorization failure and that the table be append-only, `finance-rules.md`
      requires one on a payment correction, and `data-model.md` lists it among the core
      V1 tables — but no migration had created it, so all three were unenforceable.
      Migration 0010 adds it with an insert/select-only repository and no update or
      delete path anywhere, asserted by reading the source. Wired at three points: a
      denied access, a corrected payment (recording the amount that was overwritten), and
      a deleted memory. Rows name rows and never quote them, and cascade away with the
      account so a deletion leaves no trail behind it.
- [x] `AI_MONTHLY_REQUEST_ALLOWANCE` was computed and displayed but never enforced —
      Phase 8 left "the caller decides what to do about it" and no caller did. Spending
      it now does what running with no key does: the rule-based parser takes over, every
      deterministic feature is untouched, and the reply says the allowance is spent rather
      than claiming the model was unreachable.

### What the suite cannot prove

Honest limits, not deferred work items. Every one of these needs something this
environment does not have.

- No live Postgres, so RLS is audited as SQL rather than executed, and the fake enforces
  the constraints the migrations declare rather than being the same engine.
- No live Firebase, so real token verification, expiry and revocation are stubbed.
- No live AI provider, so the model path is exercised against a stub. Every failure mode
  is covered; no real completion is.
- No browser, so both themes, Mukta's tabular figures, the PWA install path and voice on
  iOS Safari remain unverified.

### Follow-ups recorded during earlier phases

- [ ] Memory supersede (close old row + insert new) runs as two statements, not one
      transaction — the Supabase JS client has no multi-statement transaction. The
      partial unique index prevents two current rows; a Postgres function would also
      make the pair atomic. The same gap makes obligation creation non-atomic: a failure
      between the commitment insert and the obligation insert leaves an inert commitment
      behind, which `api/_tests/resilience.test.ts` documents rather than asserts away.
- [x] Integration test for the memory repository against a real database — covered
      against the in-memory database instead; a real-Postgres run is listed above under
      what the suite cannot prove.
- [x] Cross-user access test for `/api/memories` and `/api/memories/:id`
- [ ] The whole API is one serverless function (`api/index.ts`) to stay under
      Vercel's Hobby-plan limit of twelve. On a paid plan the handlers in `api/_routes/`
      could go back to file-based routing; the route table makes either shape cheap.
- [ ] Web Push delivery for notifications (service worker + VAPID), so reminders reach
      a user who does not open the app
- [x] Cross-user access tests for the Phase 4-8 endpoints (`/api/commitments`,
      `/api/tasks`, `/api/reminders`, `/api/finance/*`, `/api/drafts`, `/api/home`,
      `/api/voice/transcribe`, `/api/notifications`, `/api/usage`, `/api/privacy/*`)
- [ ] Account deletion leaves the Firebase auth user in place; decide whether to remove
      it server-side with the Admin SDK
- [ ] Both themes checked in a real browser, and Mukta's tabular figures verified
- [ ] Voice tested on a real device — MediaRecorder mime-type support varies most on
      iOS Safari, which is exactly where this has not been run
- [x] `ChatPanel` and `PastePanel` each held their own `useChat` state — fixed in
      Phase 6: `HomePage` owns one instance and passes it to both surfaces.
- [ ] Instance generation walks obligations one at a time (N+1 reads). Fine at V1
      volumes; worth a single windowed query if an account ever carries many obligations.
- [ ] Devanagari is not parsed by the offline rule parser — its patterns are Latin-script
      and `\b` word boundaries do not apply to Devanagari, so supporting it means
      restructuring every pattern rather than adding alternates. The model path handles
      Hindi; offline says so honestly (Phase 9 fix above). Doing it badly would produce
      *wrong* parses, which is worse than none, so it is recorded here rather than
      half-built.
- [ ] `DEGRADED_NO_INTENT_TEXT` and the parser's clarifying prompts ("Which payment did
      you make?") are English-only. The top-level no-intent fallback is now
      language-aware; these are not yet.

---

## V1 Definition of Done

A private-test user can do each of these. Every line is exercised end to end by the
Phase 9 suite — through the real routes, services and repositories, against the in-memory
database. None of them is checked off as *lived*, because that needs a Firebase project,
a Supabase project and a deployed URL that this environment does not have. The
distinction matters: the code paths are proven, the deployment is not.

| # | Can do | Proven by |
| --- | --- | --- |
| 1 | Log in | `api/_tests/auth.test.ts` — token verified, user provisioned idempotently |
| 2 | Tell Symora a recurring payment | `speech-ambiguity.test.ts`, `finance-integration.test.ts` |
| 3 | Add a task / reminder naturally | `ai-failure.test.ts`, `offline-corpus.test.ts` |
| 4 | Use English / Hindi / Hinglish | `nlp-corpus.test.ts`, `offline-corpus.test.ts` (Devanagari answered honestly offline; see the follow-up) |
| 5 | Return later with context remembered | `memory-service.test.ts`, `memory-context.test.ts` |
| 6 | Ask what is pending | `finance-integration.test.ts`, `home-service.test.ts` |
| 7 | Mark payments / tasks complete | `idempotency.test.ts`, `finance-integration.test.ts` |
| 8 | Paste a payment message and have it interpreted | `paste-service.test.ts`, `ai-failure.test.ts` |
| 9 | Draft a message | `template-drafter.test.ts`, `draft-fallback.test.ts` |
| 10 | Open that draft in WhatsApp / email | `handoff-adapters.test.ts` |
| 11 | Receive basic reminders | `notification-integration.test.ts` (in-app inbox; Web Push is still a follow-up) |
| 12 | See what Symora knows about them | `memory-service.test.ts`, `cross-user.test.ts` |
| 13 | Edit / delete memories | `cross-user.test.ts`, `audit.test.ts` |
| 14 | Export / delete account data | `privacy-service.test.ts` — deletion walks every table |
| 15 | Never access another user's records | `cross-user.test.ts` — ten collections, six write paths |

Remaining before a private test can actually run: create the Vercel project, create the
Supabase project and apply `supabase/migrations/` (`npm run db:check` reports what is
behind), create the Firebase project, and check both themes and voice in a real browser.
