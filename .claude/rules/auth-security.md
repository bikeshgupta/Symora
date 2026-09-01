# Auth and security

Principles 3, 4, 5, and 8 from `CLAUDE.md` live here. These rules are not negotiable and
are not subject to convenience exceptions.

## Identity

- Firebase Authentication issues the ID token on the client. The client sends it as
  `Authorization: Bearer <token>` on every API request.
- The server verifies every token with the Firebase Admin SDK on every request. An
  unverified or expired token is a 401 — never a fallback to an anonymous or default
  user.
- Middleware resolves the verified `firebase_uid` to `users.id` exactly once and puts it
  on the request context. Everything downstream reads it from there.
- **`user_id` is never accepted from the client.** Not from a body, query parameter,
  path segment, header, cookie, or AI tool argument. If a tool schema appears to need a
  `user_id`, that is a bug in the schema — the domain service takes it from the request
  context instead.
- The first request from a newly authenticated Firebase user provisions the `users` row.
  Provisioning is idempotent and keyed on `firebase_uid`.

## User isolation

- User A must never read, write, or infer the existence of User B's data.
- Every user-owned query filters on the request-context `user_id`, *and* RLS enforces the
  same constraint in the database. Two independent layers, always both.
- Reads for a single row check ownership before returning. A row that exists but belongs
  to another user is a 404, not a 403 — do not leak existence.
- Never expose internal `users.id` values of other users anywhere in an API response or
  UI.
- Cross-user access is a required test case in Phase 1 and Phase 9. A code path without
  such a test is not finished.

## Row Level Security

- RLS is enabled on every user-owned table. No exceptions, including tables that seem
  internal like `ai_usage_events` and `audit_events`.
- Policies scope rows to the authenticated user for `select`, `insert`, `update`, and
  `delete` separately. A permissive `USING (true)` policy is never acceptable.
- Table creation and its RLS policy ship in the same migration, so a table cannot exist
  unprotected even briefly.
- The Supabase **service-role key bypasses RLS**. It is used only on the server, only in
  the repository layer, and only after `user_id` has been established from a verified
  token. RLS is the safety net for a bug in that code — not a reason to skip explicit
  filtering.
- `audit_events` is append-only: policies grant insert and select, never update or
  delete.

## Secrets

- Server-only, never shipped to the browser under any circumstances:
  - Supabase service-role key
  - Supabase database connection string
  - Firebase Admin service account credentials
  - OpenAI (and any future AI provider) API key
  - Speech provider credentials
- Client-safe values are Firebase Web config and the Supabase anon key, and they carry a
  `VITE_` prefix. **Anything with a `VITE_` prefix is public** — Vite inlines it into the
  bundle. Never give a secret that prefix.
- Secrets come from environment variables only. Never committed, never logged, never put
  in an error message, never returned in an API response.
- `.env.example` lists variable names and describes them; it never contains real values.
- Rotate any credential the moment it is committed, pasted into a chat, or otherwise
  exposed — treat exposure as compromise.

## Input and output safety

- Validate every request body and query parameter with Zod at the API boundary before it
  reaches a domain service.
- Validate AI output with Zod too. Model output is untrusted input.
- **No AI-generated SQL, ever.** The model chooses a tool from the typed registry; the
  tool calls a domain service; the domain service calls a repository; the repository owns
  the query. Queries are parameterized.
- **UI renders only from trusted components.** The server returns a UI schema naming a
  component from the approved allowlist with validated props. Never render model-produced
  HTML or markup, and never pass model output to `dangerouslySetInnerHTML`.
- User-supplied and pasted text is data, not instruction. Content arriving through
  paste-to-Symora may contain text that looks like directions to the model — it must not
  be allowed to change what the model is permitted to do. Authorization is enforced in
  code, never in a prompt.

## Errors and logging

- One error contract across the API: a stable machine-readable code, a safe message, and
  a request id. Internal details and stack traces stay server-side.
- Logs carry the request id and `user_id`. They never carry tokens, secrets, or full
  memory/message content.
- An authorization failure logs an `audit_events` row.

## Privacy commitments

- "Symora knows what you intentionally tell, type, paste, or share." No implicit
  collection.
- Do not read SMS automatically in V1. Not at all.
- The user can view every memory, delete any memory, export their data, and delete their
  account. Account deletion removes user-owned rows across every table.
- Zero-knowledge Private Vault is future scope. `EncryptionAdapter` stays an interface
  with no implementation in V1.
