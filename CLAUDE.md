# Symora

## Product goal

Symora V1 proves one core behavior: a user can tell, type, paste, or share something
important; Symora understands it (English, Hindi, or Hinglish), stores it safely,
remembers the right context, reminds the user, and helps them act. The V1 surface is a
React PWA with an "Ask Symora" input backed by an AI intent pipeline over deterministic
domain services — personal memory, commitments, finance obligations, tasks, and
reminders — plus paste-to-Symora interpretation, message drafting, and one-tap handoff
to WhatsApp and email.

## V1 stack

- **Frontend:** React, TypeScript, Vite, PWA, Tailwind CSS, shadcn/ui, Lucide,
  TanStack Query, Zod, Recharts (only where genuinely useful)
- **Backend:** Node.js, TypeScript, Vercel serverless functions
- **Auth:** Firebase Authentication (client), Firebase Admin verification (server)
- **Database:** Supabase PostgreSQL with RLS
- **Storage:** Supabase Storage, only where needed
- **AI:** OpenAI API behind an `AIProvider` abstraction; structured outputs / tool
  calling; cheap model for routine parsing and drafting, stronger model only for
  complex cases
- **Voice:** speech-to-text provider behind `SpeechAdapter`
- **Testing:** Vitest, Playwright, integration tests, authorization tests, NLP
  regression corpus

## Architecture principles

1. TypeScript end-to-end for V1.
2. AI understands language; the backend owns truth.
3. Never allow AI-generated arbitrary SQL.
4. `user_id` is derived from verified authentication.
5. User A must never access User B.
6. Finance calculations are deterministic.
7. Memory is explicit and editable.
8. UI is rendered only from trusted components.
9. Future features remain behind interfaces and feature flags.
10. V1 must not require an architectural rewrite for V2.

## Hard rules

- **Build only items marked V1.** The requirements doc lists V1 scope explicitly.
- **Never implement Future / V2 / V3 scope unless explicitly asked.** Future items may
  influence interface boundaries and data design, but must not be built. Do not add a
  feature merely because it appears in the requirements document.
- **Finance calculations must be deterministic.** No AI in any arithmetic path. Totals,
  due dates, and monthly requirements are computed in code from stored rows, and the
  same inputs must always produce the same output.
- **`user_id` is always derived from verified auth.** Take it from the verified Firebase
  token on the server. Never accept `user_id` from a request body, query string,
  header, AI output, or client state.
- **No AI-generated SQL.** The model may only select from a typed tool registry with
  validated arguments. Tools call domain services; domain services call repositories;
  repositories own every query.
- **UI is rendered only from trusted components.** The server returns a UI schema that
  names a component from the approved allowlist. Never render AI-produced HTML,
  markup, or arbitrary component descriptors.
- **UI uses semantic design tokens only.** Never a raw palette value in a component —
  no `violet-500`, no `red-500`, no hex literals. Status is always communicated by
  colour *and* a text label or icon, never colour alone.
- **Server secrets never reach the frontend.** Supabase service-role key, Firebase Admin
  credentials, and AI provider keys are server-only. Only `VITE_`-prefixed values are
  client-safe.
- **Adapters stay interfaces until their phase.** `EncryptionAdapter` and
  `CalendarAdapter` are type-only in V1 and must not gain implementations.

## Current status

Phases 1-5 are complete: foundation/auth/DB; the Ask Symora chat pipeline over the
typed tool registry; personal memory; the commitments umbrella with deterministic
finance (obligations vs instances, bounded idempotent generation, derived
overdue/outstanding), tasks, reminders with lead times and recurring important dates;
and paste-to-Symora, message drafting and the WhatsApp/email handoff.
Phase 6 — the personalized home and the seven trusted UI components — is next.

See `PROGRESS.md` for the phase-by-phase checklist and acceptance criteria. Update it
whenever a phase item is completed.

## Detailed rules

Read the relevant file before working in that area:

- `.claude/rules/data-model.md` — core tables and their columns
- `.claude/rules/auth-security.md` — RLS, user isolation, secret handling
- `.claude/rules/finance-rules.md` — obligations vs instances, determinism, idempotency,
  timezone
- `.claude/rules/ai-pipeline.md` — request flow, intents, confidence and confirmation
  rules, typed tool registry
- `.claude/rules/design-system.md` — colour tokens for both themes, geometry, spacing,
  typography (incl. Devanagari), Tailwind wiring, theme switching, component rules

## Reference documents

Large — do not load these unless the current task needs them. Referenced by path
deliberately, not imported.

- `docs/Symora_V1_Requirements_and_Architecture_FULL.md` — the single implementation
  reference: full scope, phases, acceptance criteria, data model, API groups, and
  V1 definition of done
- `docs/symora-architecture-diagram.md` — V1 vs future architecture, request flow, and
  the adapter interface list
- `docs/architecture/` — architecture decision records and design notes added as the
  project progresses

## Repository layout

```
apps/web/              React PWA (Phase 1 scaffolds Vite/Tailwind/shadcn)
api/                   Vercel serverless functions, one folder per API group
  _middleware/         auth middleware, request context, error contract, logger
packages/core/src/
  domain/              deterministic domain services (memory, commitments,
                       finance, tasks, reminders, drafting)
  ai/orchestrator/     language detection, routing, intent extraction, confidence
  ai/tools/            typed tool registry
  repositories/        the only layer that issues database queries
  adapters/            side-adapter interfaces (+ the OpenAI AIProvider implementation)
  types/               shared domain and API types
supabase/migrations/   versioned SQL migrations
docs/architecture/     architecture notes and ADRs
```

## API groups

`/api/me`, `/api/chat`, `/api/memories`, `/api/commitments`, `/api/tasks`,
`/api/reminders`, `/api/finance`, `/api/drafts`, `/api/notifications`, `/api/usage`,
`/api/privacy/export`, `/api/privacy/delete`.

## Working conventions

- Keep the layering intact: `api` → domain service → repository → database. API
  handlers hold no business logic; domain services issue no raw SQL.
- Every new table ships with an RLS policy in the same migration.
- Migrations are versioned, forward-only, and never edited after being applied.
- Validate every external input (request bodies and AI output alike) with Zod before it
  reaches a domain service.
- Prefer adding to an existing adapter interface over introducing a direct provider
  dependency in the domain layer.
