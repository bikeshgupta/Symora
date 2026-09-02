# Symora

A personal assistant that remembers what matters.

Tell, type, paste, or share something important — in English, Hindi, or Hinglish —
and Symora understands it, stores it safely, remembers the right context, reminds you,
and helps you act on it.

## Status

**Phases 1–2 (foundation/auth/database, and the Ask Symora chat + AI pipeline) built,
not yet verified live.** The app runs end-to-end once real Firebase/Supabase/Vercel/
OpenAI credentials are in place; see "Getting started" below and
[`PROGRESS.md`](PROGRESS.md) for exactly what's left to check off.

See [`PROGRESS.md`](PROGRESS.md) for the phase-by-phase plan and acceptance criteria.

## V1 scope

Authentication and profile · Ask Symora text interface · basic voice input · English,
Hindi and Hinglish · personal memory · commitments · tasks · reminders · basic finance
obligation and payment tracking · paste-to-Symora · message drafting · one-tap WhatsApp
and email handoff · personalized home with Needs Attention · a small set of trusted UI
components · basic notifications · AI usage tracking · privacy, export and delete basics.

Everything else in the requirements document is future scope and is not built.

## Stack

React · TypeScript · Vite · PWA · Tailwind CSS · shadcn/ui · TanStack Query · Zod ·
Node.js on Vercel serverless functions · Firebase Authentication with Firebase Admin
verification · Supabase PostgreSQL with RLS · OpenAI behind a provider abstraction ·
Vitest and Playwright.

## Layout

```
apps/web/              React PWA
api/                   Vercel serverless functions, one folder per API group
packages/core/src/
  domain/              deterministic domain services
  ai/                  orchestrator and typed tool registry
  repositories/        the only layer that queries the database
  adapters/            side-adapter interfaces
supabase/migrations/   versioned SQL migrations
docs/                  requirements, architecture diagram, and ADRs
.claude/rules/         working rules for data model, security, finance and AI
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — product goal, stack, principles, and hard rules
- [`PROGRESS.md`](PROGRESS.md) — build tracker
- [`docs/Symora_V1_Requirements_and_Architecture_FULL.md`](docs/Symora_V1_Requirements_and_Architecture_FULL.md) —
  the single implementation reference
- [`docs/symora-architecture-diagram.md`](docs/symora-architecture-diagram.md) —
  V1 vs future architecture and request flow

## Getting started

1. `npm install` at the repo root (npm workspaces cover `apps/web` and `packages/core`).
2. Create a Firebase project (Email/Password + Google sign-in enabled), a Supabase
   project, and an OpenAI API key.
3. Copy `.env.example` to `.env.local` and fill in the Firebase Web config, the Firebase
   Admin service account, the Supabase URL/anon key/service-role key/DB URL, and
   `OPENAI_API_KEY` + `AI_MODEL_CHEAP`/`AI_MODEL_STRONG` (any current OpenAI chat model
   id with tool-calling support — Ask Symora only uses the cheap tier so far). Never
   give a secret a `VITE_` prefix; that prefix makes a value public.
4. Apply `supabase/migrations/` to your Supabase project (`supabase db push`, or run the
   SQL files in order via the Supabase SQL editor).
5. `npm run dev` starts the frontend only (`apps/web`, via Vite). To exercise `/api/*`
   locally too, install the Vercel CLI and run `vercel dev` from the repo root instead —
   it serves both the Vite app and the `api/` serverless functions together.
6. `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` all run
   across every workspace from the repo root.

## Privacy

Symora knows what you intentionally tell, type, paste, or share. It does not read your
SMS. You can see everything it knows about you, edit or delete any of it, export your
data, and delete your account.
