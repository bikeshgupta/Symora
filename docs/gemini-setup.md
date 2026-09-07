# Pointing Symora at Gemini's free tier

Gemini speaks the OpenAI-compatible API, so it needs no new code — it is the same
`AIProvider` adapter, the same typed tool registry, the same deterministic domain
services. What it needs is four environment variables and a decision about *when* a model
request is worth spending, which is the part that matters on a free tier.

## The variables

Set these in Vercel → your project → Settings → Environment Variables, for the
Production environment (and Preview, if you test there). They are server-only: none of
them may ever carry a `VITE_` prefix, which would inline them into the browser bundle
(`.claude/rules/auth-security.md`).

| Variable | Value |
| --- | --- |
| `AI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_API_KEY` | the key from [AI Studio](https://aistudio.google.com/apikey) |
| `AI_MODEL_CHEAP` | `gemini-2.5-flash-lite` (or `gemini-2.5-flash`) |
| `AI_MONTHLY_REQUEST_ALLOWANCE` | a number below your daily cap × 30, e.g. `1000` |

Redeploy after adding them — Vercel only picks up environment variables on a new build.

Then open Symora and send something ordinary. The chat screen tells you which state the
model layer is in without your having to read a log: no strip above the composer means
Gemini answered.

**A note on what leaves the machine.** Free-tier Gemini usage may be used by Google to
improve their products; the paid tier is not. Symora holds things people are anxious
about — money that is due, promises they made — so this is a real decision, not a
formality. Nothing is sent unless a turn actually escalates (below), and the deterministic
half of the app never sends anything at all. If that trade is not one you want, leave the
variables unset and Symora runs on its own parser, or use a paid key.

## When a request is actually spent

The rule parser reads every message first, and the model is asked only for what it could
not handle (`packages/core/src/ai/orchestrator/escalation.ts`). This is the difference
between a free tier lasting a day and lasting a month.

Spends nothing:

- `Home loan 42500 every month on the 5th`
- `Paid the electricity bill today`
- `Remind me to call the doctor tomorrow`
- `Remember my landlord is Rakesh Sharma`
- `what is pending?` · `How much do I need this month?`
- any greeting, and any small talk

Spends one request:

- a sentence the parser did not recognise at all
- one it recognised only partially — `Home loan i pay 5th of every month` has no amount
- one whose arguments would not satisfy the tool schema
- drafting a message, and interpreting pasted text that is not a clean match

The bar is deliberately high: a *clear* match — the parser's own word for "every required
field was found" — proceeds on its own; anything less asks the model, because a
half-understood sentence that becomes a task titled "Home loan i pay 5th of month" is a
worse outcome than spending one request. Reads are the exception: they write nothing, so
a merely likely match is enough.

Set `AI_CALL_POLICY=always` to go back to a model request per turn. That is the right
setting for a key you pay per token, where understanding matters more than call count.

## Quotas, and what happens when you hit one

Gemini's free tier is rationed per minute and per day, and the limits change; the current
ones are on the [rate limits page](https://ai.google.dev/gemini-api/docs/rate-limits) and
your own usage is in AI Studio.

Two independent guards:

- **`AI_MONTHLY_REQUEST_ALLOWANCE`** is Symora's own ceiling, counted per user in calendar
  months in their timezone. Spending it is not a failure: `/api/chat` stops calling the
  provider and the rule parser takes over, and the reply says so. Set it below what
  Google would refuse, so your users meet Symora's honest message rather than a 429.
- **The circuit breaker** handles the 429 you get anyway. The first one opens the circuit
  for `AI_UNREACHABLE_COOLDOWN_MS` (default 60s), so the turns during a burst go straight
  to the rule parser in milliseconds instead of each waiting out a refusal. The app says
  "Gemini is rate limiting Symora for the moment", which is a different sentence from
  "not answering" and from "not configured" on purpose — they are three different next
  actions.

## If tool calls come back wrong

The adapter tries the endpoint's native tool calling and falls back to JSON when it is
refused. If Gemini accepts the `tools` parameter but returns something unusable, set
`AI_TOOL_MODE=json` to skip native tool calling entirely — the adapter then describes the
tools in the prompt and maps the JSON reply back into a tool call. Nothing above the
`AIProvider` boundary can tell the difference.

## What Gemini does not do here

Voice transcription stays in the browser. Server-side speech goes to OpenAI's
`/audio/transcriptions`, and a chat endpoint that speaks the OpenAI protocol is not a
speech endpoint — offering a mic that 404s would be worse than not offering one. Chrome
and Edge do the recognition on the device; Firefox hides the mic instead.

Money is never computed by a model, whichever provider is configured. Totals, due dates,
overdue counts and monthly requirements are arithmetic in code over stored rows
(`.claude/rules/finance-rules.md`). Gemini reads sentences; it does not do the sums.
