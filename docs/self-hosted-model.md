# Running Symora's model yourself

Symora talks to any endpoint that speaks the OpenAI-compatible HTTP API. Ollama, vLLM,
LM Studio, llama.cpp's server, Groq and Together all do, so pointing it at a model on a
machine you own is one environment variable.

```
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL_CHEAP=qwen2.5:7b-instruct
```

That is the entire integration. Nothing above the `AIProvider` boundary — no route, no
domain service, no repository — knows or cares where the model lives.

## Choose a model with the scorecard, not a guess

Published benchmarks are for English. Symora's actual job is pulling structured
arguments out of short Hindi and Hinglish sentences, which is both narrower and harder.
So measure it:

```
AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL_CHEAP=qwen2.5:7b npm run ai:score
```

This runs the model against the same real phrases the test suite guards regressions with
(`packages/core/src/ai/corpus/nlp-corpus.json`) and prints intent accuracy, argument
accuracy and a per-language breakdown. Run it on a laptop before spending anything on
hosting — a 3B model that scores well on your phrasing is a very different budget from
one that does not.

Useful flags: `--tool-mode json` when a model's native tool calling is unreliable,
`--verbose` to see each reply, `--limit 10` for a quick smell test.

## Hardware, honestly

The task is short structured extraction, not open-ended chat, so a small model goes a
long way. Rough shape of the trade:

| Setup | Cost | Reality |
| --- | --- | --- |
| Your laptop, dev | Free | Fine for building and for the scorecard |
| CPU VPS, 4–8 vCPU | ~$20–40/mo | Works. Seconds per turn, not milliseconds |
| Small GPU box | ~$100–300/mo | Comfortable |
| Hosted API | Cents to a few $/mo at pilot scale | Cheapest when volume is low |

A 7–8B model quantized to Q4 needs roughly 5GB; a 3B needs about 2GB. At pilot volumes
self-hosting is *more* expensive than a hosted API — it wins on privacy, on having no
per-request cost once volume grows, and on not being locked to a vendor.

## Reaching a machine at home from Vercel

Your laptop sits behind a router with no public address, so the deployment cannot dial it
directly. Do not port-forward. Use a tunnel, where the machine makes an outbound
connection and gets a public HTTPS hostname:

- **Cloudflare Tunnel** — free, permanent hostname, no inbound ports. The one to prefer.
- **ngrok** — quickest to start, but the free URL changes on every restart, which means
  editing the deployment's env vars each time.
- **Tailscale Funnel** — good if you already run Tailscale.

Then set `AI_BASE_URL` to the tunnel's `/v1` URL.

### Ollama has no authentication

This matters more than anything else on this page. Ollama does not check credentials.
Anything that can reach the URL can use your machine.

Symora already sends `Authorization: Bearer <AI_API_KEY>` on every request, so the fix
needs no code: put something in front that requires it — Cloudflare Access with a service
token, or a small reverse proxy — and set `AI_API_KEY` to a long random secret. A
self-hosted endpoint that is genuinely private (bound to localhost, or reachable only
over a VPN) can leave `AI_API_KEY` unset; Symora treats a base URL without a key as
deliberate rather than misconfigured.

## When the machine is off

This is expected, not exceptional, and Symora is built for it.

- **Every deterministic feature keeps working** — payments, commitments, reminders,
  notifications, memory, the home screen, export and delete. None of them ever needed a
  model.
- **Chat degrades rather than failing.** The rule-based parser in
  `packages/core/src/ai/offline/` takes over, and the reply says the model was
  unreachable rather than blaming the user's phrasing.
- **Only the first turn waits.** A refused connection opens a circuit breaker
  (`packages/core/src/adapters/provider-health.ts`), so subsequent turns fail in
  microseconds instead of paying the full timeout each time. One probe goes through per
  `AI_UNREACHABLE_COOLDOWN_MS` to see whether the machine came back; when it does,
  everything resumes with no restart.
- **`/api/me` reports `modelStatus: 'unreachable'`**, distinct from `'offline'` — the
  first is a machine the user can switch on, the second is a deployment that was never
  configured, and the interface should not use one word for both.

The circuit breaker's state lives in a warm serverless instance, not in a shared store,
so the first turn on a cold instance pays the timeout again. Persisting it would cost a
database round trip on every turn, which is a worse trade at these volumes.

## Timeouts — get this right before pointing at anything slow

`vercel.json` sets `maxDuration` to 30s and `AI_REQUEST_TIMEOUT_MS` defaults to 12s. That
ordering is deliberate and must be preserved: **the provider has to time out before the
platform kills the function.** If the platform wins, the user gets a raw 504 and the
graceful fallback never runs — and a model on a CPU is exactly the slow case where this
shows up.

If you raise `AI_REQUEST_TIMEOUT_MS`, raise `maxDuration` further first.

## Structured output on small models

Symora asks the model for a tool call. Support for native tool calling among small open
models is inconsistent — several accept the `tools` parameter and then ignore it.

`AI_TOOL_MODE` controls this:

- `auto` (default) — try native tool calling; if the endpoint refuses it, fall back to a
  JSON object matching a schema described in the prompt, and remember that for the
  process. The reply is mapped back into a tool call inside the adapter, so nothing
  downstream can tell which was used.
- `json` — skip native tool calling entirely. The safe choice if the scorecard shows a
  model doing badly in `auto`.
- `native` — never fall back. Fail instead, so a misconfiguration is visible.

## Speech is separate

Server-side transcription deliberately does **not** follow `AI_BASE_URL`: a self-hosted
chat model is not a speech model, and pointing the mic at it would 404 on first press.
With a self-hosted endpoint, `/api/me` reports `serverTranscription: false` and the client
uses the browser's own Web Speech API instead — which works well in Chrome and Edge, and
is hidden in Firefox.
