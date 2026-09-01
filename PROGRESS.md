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

## Phase 1 — Foundation / Auth / DB — 10h — Not started

Build:

- [ ] Repo structure
- [ ] React / Vite / TypeScript
- [ ] Tailwind / shadcn
- [ ] PWA base
- [ ] Vercel setup
- [ ] Firebase Auth
- [ ] Firebase Admin server verification
- [ ] Supabase project and schema
- [ ] RLS
- [ ] Server-only secrets
- [ ] API error contract
- [ ] Logging convention
- [ ] Feature flags
- [ ] Migrations

Acceptance:

- [ ] Login works
- [ ] `/api/me` returns the verified user
- [ ] User A cannot query User B
- [ ] Vercel deploy works
- [ ] Migrations are versioned
- [ ] No server secret reaches the frontend

## Phase 2 — Core Ask Symora + AI pipeline — 15h — Not started

Build:

- [ ] Ask Symora text input
- [ ] Basic chat history
- [ ] AIProvider abstraction
- [ ] Language detection
- [ ] Domain routing
- [ ] Intent / entity extraction
- [ ] Confidence handling
- [ ] Typed tool registry
- [ ] Structured response format

Initial intents:

- [ ] `create_commitment`
- [ ] `create_task`
- [ ] `create_reminder`
- [ ] `create_financial_obligation`
- [ ] `mark_paid`
- [ ] `mark_done`
- [ ] `reschedule`
- [ ] `list_pending`
- [ ] `calculate_monthly_requirement`
- [ ] `remember_preference`
- [ ] `draft_message`
- [ ] `interpret_pasted_message`

Acceptance examples:

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
