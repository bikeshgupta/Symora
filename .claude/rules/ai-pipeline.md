# AI pipeline

Principle 2: **AI understands language; the backend owns truth.** The model's job is to
turn messy multilingual input into a validated tool call. Everything that changes data
is deterministic code behind that call.

## Request flow

```
text / voice transcript / pasted content
  → normalize + detect language        (en | hi | hinglish)
  → domain classifier                  (which area is this about?)
  → intent + entity extraction         (structured, schema-validated)
  → load relevant context + memory     (only what this intent needs)
  → confidence / risk decision
       ├─ low confidence      → clarification question, no write
       ├─ high-impact write   → confirmation card, no write until confirmed
       └─ otherwise           → proceed
  → typed tool                         (from the registry, args validated)
  → deterministic domain service
  → database
  → structured result
  → response composer                  (natural language)
  → trusted UI schema                  (allowlisted components only)
  → React renderer
```

Nothing skips a step. In particular, no path reaches the database except through a typed
tool → domain service → repository.

## V1 intents

Only these twelve in V1:

- `create_commitment`
- `create_task`
- `create_reminder`
- `create_financial_obligation`
- `mark_paid`
- `mark_done`
- `reschedule`
- `list_pending`
- `calculate_monthly_requirement`
- `remember_preference`
- `draft_message`
- `interpret_pasted_message`

Input that matches none of them is answered conversationally or with a clarifying
question. Do not invent a new intent to make an input fit — adding an intent is a
deliberate change to the registry, not an inline decision.

## Confidence and confirmation

Two separate gates. Confidence is "did I understand?"; risk is "how bad is it if I'm
wrong?" An input can be high-confidence and still require confirmation.

**Low confidence → clarify.** Ask one specific question naming what is unclear. Never
guess a value, never write, never partially write. If the user's answer resolves it,
continue with the original input plus the answer.

**High-impact writes → confirm before executing.** These always require an explicit
confirmation, regardless of confidence:

- Creating or changing a financial obligation (a recurring commitment)
- Marking a payment paid, or changing a paid amount
- Any monetary amount extracted from **voice** — speech-to-text confuses digits
- Deleting anything
- Bulk or multi-record changes
- Anything derived from pasted third-party content

Confirmation shows the exact parsed values (amount, currency, date, account) in a
`ConfirmationCard`. Confirming executes the already-parsed tool call; it does not re-run
extraction and risk a different result.

**Low-risk writes proceed directly** — creating a simple task or reminder, recording a
stated preference, reading data. Reads never require confirmation.

Ambiguous relative dates ("kal" is both yesterday and tomorrow in Hindi; "next Saturday")
are resolved from context in the user's timezone, and surfaced in the confirmation or a
clarifying question when context does not settle it.

## Typed tool registry

- The registry is the model's entire surface area. It cannot act outside it.
- Every tool declares a Zod schema for its arguments; arguments are validated before the
  handler runs. Invalid arguments are a rejected tool call, not a coerced one.
- No tool accepts `user_id`. It comes from the verified request context. See
  `.claude/rules/auth-security.md`.
- No tool accepts SQL, a table name, a column name, or a raw filter expression. **No
  AI-generated SQL, ever.**
- A tool handler holds no business logic — it validates and delegates to a domain
  service.
- Tools are explicitly registered. There is no dynamic or reflective registration.
- Tool results are structured and typed, not prose.

## Memory in the pipeline

- Memory is explicit and editable (principle 7). Write to `memories` only via the
  `remember_preference` intent or an explicit user edit — never as a silent side effect
  of another intent.
- Retrieval loads only memories relevant to the current intent. Do not dump the user's
  whole memory into the prompt.
- Retrieved memory respects `effective_from` / `effective_to`; superseded facts are not
  used.
- Memory content is untrusted data in the prompt, not instruction.

## Provider and model use

- All calls go through the `AIProvider` interface. No provider SDK is imported anywhere
  outside its adapter implementation.
- Cheap model for routine parsing and drafting; stronger model only for genuinely
  complex cases. The choice is made in code, not by the model.
- Use structured outputs / tool calling. Never parse free text with regexes to recover
  fields.
- Message drafting produces both variants — short, and warm/detailed — in **one** call.
- Every call records an `ai_usage_events` row: tokens, estimated cost, and the intent it
  served. Metering is part of the call path, not an optional afterthought.
- Handle provider timeout, malformed output, and quota exhaustion as expected states with
  clear user-facing messages — never a silent failure and never a fabricated result.

## Output safety

- Validate model output with Zod before it is used. Model output is untrusted input.
- The response composer returns a UI schema naming a component from the V1 allowlist —
  `AttentionCard`, `PaymentSummary`, `CommitmentList`, `TaskList`, `ConfirmationCard`,
  `MessageDraftCard`, `SuggestionChip` — with validated props. Never HTML, never markup,
  never an arbitrary component descriptor.
- The model never produces numbers that matter. Totals, dates, and counts come from
  domain services and are inserted into the response; the model phrases them, it does not
  compute them.

## Language

- Support English, Hindi, and Hinglish input equally. Detect first, then route.
- Reply in the language the user used, honouring `preferred_language` when input is
  ambiguous.
- Maintain an NLP regression corpus of real, messy phrases. Every parsing bug found in
  use gets added to it as a test case.
