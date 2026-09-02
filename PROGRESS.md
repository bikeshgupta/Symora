# Symora — Progress

Phase-by-phase build tracker. Source of truth for scope and acceptance criteria:
`docs/Symora_V1_Requirements_and_Architecture_FULL.md`.

**Overall status: not started.** Skeleton and documentation only — no feature code yet.

| Phase | Status | Estimate |
| --- | --- | --- |
| 0 — Skeleton and memory files | Done | — |
| 1 — Foundation / Auth / DB | Not started | 10h |
| 2 — Core Ask Symora + AI pipeline | Not started | 15h |
| 3 — Personal memory | Not started | 12h |
| 4 — Commitments + finance + tasks/reminders | Not started | 20h |
| 5 — Paste/share + drafting + WhatsApp/email | Not started | 10h |
| 6 — Personalized home + small dynamic UI | Not started | 10h |
| 7 — Voice + Hindi/Hinglish | Not started | 10h |
| 8 — Notifications + usage + privacy basics | Not started | 8h |
| 9 — Testing / hardening | Not started | 15–25h |

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

Acceptance examples — code path exists for all five, **not yet exercised against a
live OpenAI/Supabase project** (no `OPENAI_API_KEY`/Supabase project configured in this
environment):

- [ ] "Home loan 42500 every month on 5th."
- [ ] "Saturday electrician ko call karna."
- [ ] "Remind me 2 days before every bill."
- [ ] "This month what all is pending?"
- [ ] "Home loan kal pay kar diya."

## Phase 3 — Personal memory — 12h — Not started

Build:

- [ ] Explicit memory storage
- [ ] Aliases
- [ ] Preferences
- [ ] Correction memory
- [ ] Relevant-memory retrieval
- [ ] "What Symora knows about me"
- [ ] Edit / delete memory
- [ ] Effective-date support

Acceptance:

- [ ] Learned information reduces repeated clarification

## Phase 4 — Commitments + finance + tasks/reminders — 20h — Not started

Commitment umbrella:

- [ ] Payments
- [ ] Tasks
- [ ] Reminders
- [ ] Important dates

Finance V1:

- [ ] Recurring obligations
- [ ] Monthly instances
- [ ] Due dates
- [ ] Paid / pending
- [ ] Amount / date
- [ ] Monthly required total
- [ ] Upcoming payments

Tasks:

- [ ] Create
- [ ] Due date / time
- [ ] Priority
- [ ] Status
- [ ] Mark done
- [ ] Reschedule

Reminders:

- [ ] One-time
- [ ] Recurring
- [ ] Lead-time preference

Important dates:

- [ ] Birthdays
- [ ] Anniversaries
- [ ] Renewal dates

Acceptance:

- [ ] Finance totals deterministic
- [ ] Recurring definition separate from monthly history
- [ ] Idempotent updates
- [ ] Correct timezone handling

## Phase 5 — Paste/share + drafting + WhatsApp/email — 10h — Not started

Paste-to-Symora — Symora interprets and proposes an action for:

- [ ] Payment confirmation
- [ ] Appointment
- [ ] Booking confirmation
- [ ] Renewal message
- [ ] Other useful text

Message drafting:

- [ ] Generate 2 variants in one AI call (short, and warm/detailed)
- [ ] Use known relationship / context when available

Handoff:

- [ ] One-tap WhatsApp — `wa.me` link with prefilled text (no WhatsApp Business API in V1)
- [ ] One-tap email — `mailto` prefill in V1
- [ ] Share-to-Symora — design the adapter/interface now (native share extension later if
      required)

## Phase 6 — Personalized home + small dynamic UI — 10h — Not started

Home:

- [ ] Greeting
- [ ] Needs Attention
- [ ] Upcoming payment
- [ ] Today task
- [ ] Important date
- [ ] Overdue item
- [ ] Contextual suggestions
- [ ] Ask Symora input

Trusted V1 UI components:

- [ ] `AttentionCard`
- [ ] `PaymentSummary`
- [ ] `CommitmentList`
- [ ] `TaskList`
- [ ] `ConfirmationCard`
- [ ] `MessageDraftCard`
- [ ] `SuggestionChip`

Component rules (see `.claude/rules/design-system.md`):

- [ ] All seven share one `CardShell` — same radius, padding rhythm, and elevation
- [ ] Status communicated by colour **and** text or icon in every component, never
      colour alone
- [ ] `ConfirmationCard` visually distinct from every passive card
- [ ] Every screen checked in both light and dark themes

- [ ] Avoid a generic dashboard

## Phase 7 — Voice + Hindi/Hinglish — 10h — Not started

Build:

- [ ] Push-to-talk
- [ ] Speech-to-text
- [ ] Raw transcript
- [ ] Language detection
- [ ] Hindi / Hinglish interpretation
- [ ] Confirmation for ambiguous sensitive values

Acceptance:

- [ ] "Kal wali EMI bhar diya."
- [ ] "Saturday electrician ko call karna yaad dila dena."
- [ ] "Agle 5 din me kitna payment baki hai?"

## Phase 8 — Notifications + usage + privacy basics — 8h — Not started

Notifications:

- [ ] Due payment
- [ ] Task
- [ ] Birthday
- [ ] Reminder

Usage:

- [ ] Requests
- [ ] Tokens
- [ ] Estimated cost
- [ ] User allowance
- [ ] Reset date

Privacy:

- [ ] View memories
- [ ] Delete memory
- [ ] Export data
- [ ] Delete account
- [ ] Clear data-access wording
- [ ] Privacy principle honoured: "Symora knows what you intentionally tell, type,
      paste, or share."
- [ ] SMS is not read automatically in V1

## Phase 9 — Testing / hardening — 15–25h — Not started

Test:

- [ ] Auth
- [ ] RLS
- [ ] Cross-user access
- [ ] Duplicate writes
- [ ] Timezone
- [ ] Recurring finance
- [ ] Speech ambiguity
- [ ] Hindi / Hinglish
- [ ] Malformed AI output
- [ ] Provider timeout / failure
- [ ] Network failure
- [ ] Quota exhaustion
- [ ] Notifications
- [ ] Data deletion / export

- [ ] Maintain an NLP regression corpus of messy real user phrases

---

## V1 Definition of Done

A private-test user can:

- [ ] 1. Log in
- [ ] 2. Tell Symora a recurring payment
- [ ] 3. Add a task / reminder naturally
- [ ] 4. Use English / Hindi / Hinglish
- [ ] 5. Return later and have Symora remember important context
- [ ] 6. Ask what is pending
- [ ] 7. Mark payments / tasks complete
- [ ] 8. Paste a payment message and let Symora interpret it
- [ ] 9. Draft a message
- [ ] 10. Open that draft directly in WhatsApp / email
- [ ] 11. Receive basic reminders
- [ ] 12. See what Symora knows about them
- [ ] 13. Edit / delete memories
- [ ] 14. Export / delete account data
- [ ] 15. Never access another user's records
