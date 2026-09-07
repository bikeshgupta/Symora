/**
 * Scores a candidate model against Symora's own NLP corpus.
 *
 * Choosing a model to self-host is otherwise a guess: the marketing numbers are for
 * English benchmarks, and Symora's actual job is pulling structured arguments out of
 * short Hindi/Hinglish sentences. This runs the same real phrases the test suite guards
 * against regressions with — `packages/core/src/ai/corpus/nlp-corpus.json` — and reports
 * what fraction the model actually got right.
 *
 * The point is to answer "is a 3B on a cheap VPS good enough" with a number, before
 * spending anything on hardware.
 *
 *   AI_BASE_URL=http://127.0.0.1:11434/v1 AI_MODEL_CHEAP=qwen2.5:7b npm run ai:score
 *   npm run ai:score -- --tool-mode json --verbose
 *
 * Read-only: it sends chat completions and writes nothing anywhere.
 */

import fs from 'node:fs';
import path from 'node:path';

const CORPUS_PATH = 'packages/core/src/ai/corpus/nlp-corpus.json';

/** Minimal .env reader — this runs outside the app, so it has no config layer to borrow. */
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      let value = match[2].trim();
      if (
        value.length > 1 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}

function parseArgs(argv) {
  const options = { toolMode: process.env.AI_TOOL_MODE || 'auto', verbose: false, limit: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--tool-mode') options.toolMode = argv[++i];
    else if (argv[i] === '--verbose' || argv[i] === '-v') options.verbose = true;
    else if (argv[i] === '--limit') options.limit = Number(argv[++i]) || 0;
  }
  return options;
}

// ---------------------------------------------------------------------------
// The request. Deliberately hand-rolled rather than importing the app's adapter: this
// script must be able to test an endpoint the app would refuse to start against, and
// seeing the raw request is the point when a self-hosted server behaves oddly.
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTIONS = {
  create_commitment: 'Record an important date such as a birthday or an anniversary.',
  create_task: 'Add a task the user has to do.',
  create_reminder: 'Add a reminder, optionally a set number of days before the due date.',
  create_financial_obligation: 'Record a recurring payment: an EMI, rent, a bill, a subscription.',
  mark_paid: 'Record that a payment has been made.',
  mark_done: 'Mark a task or reminder as done.',
  reschedule: 'Move something to a different date.',
  list_pending: 'List what is still outstanding.',
  calculate_monthly_requirement: 'Total up what is due this month.',
  remember_preference: 'Remember a fact, alias or preference the user stated.',
  draft_message: 'Draft a message to somebody.',
  interpret_pasted_message: 'Interpret text pasted or quoted from somebody else.',
};

const SYSTEM_PROMPT = [
  "You are Symora's request interpreter. The message may be in English, Hindi or Hinglish",
  '(romanized Hindi mixed with English).',
  'Reply with a single JSON object and nothing else: {"intent": <one of the names below, or null>,',
  '"args": {...}}. Choose at most one intent. If nothing fits, set intent to null.',
  'Never invent an intent name that is not listed.',
  '',
  'Today is Saturday 5 September 2026 in Asia/Kolkata. Resolve relative dates against that',
  'and return every date as YYYY-MM-DD. "kal" and "parso" can point either forwards or',
  'backwards; use the tense of the sentence to decide.',
  '',
  'Intents:',
  ...Object.entries(TOOL_DESCRIPTIONS).map(([name, description]) => `- ${name}: ${description}`),
].join('\n');

function extractJsonObject(text) {
  if (!text) return null;
  const attempt = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };
  const direct = attempt(text);
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return attempt(fenced[1].trim());

  const braced = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return braced ? attempt(braced) : null;
}

async function ask(baseUrl, apiKey, model, text, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}` };
    }
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content ?? null;
    return { parsed: extractJsonObject(content), raw: content };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Loose comparison on purpose.
 *
 * A model that answers 42500 where the corpus says 42500, or "Home loan" where it says
 * "home loan", got the answer right. Holding it to exact case and type would report a
 * usable model as a failure — and the pipeline's Zod schemas coerce neither, they
 * validate, so what matters is whether the value is recoverable.
 */
function valueMatches(expected, actual) {
  if (actual === undefined || actual === null) return false;
  if (typeof expected === 'number') return Number(actual) === expected;
  return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

function scoreRow(row, parsed) {
  if (!parsed || typeof parsed !== 'object') return { intent: false, args: 0, argsTotal: 0 };

  const intent = parsed.intent === row.intent;
  const expectedArgs = row.args ?? {};
  const actualArgs = parsed.args && typeof parsed.args === 'object' ? parsed.args : {};

  let correct = 0;
  for (const [key, value] of Object.entries(expectedArgs)) {
    if (valueMatches(value, actualArgs[key])) correct += 1;
  }
  return { intent, args: correct, argsTotal: Object.keys(expectedArgs).length };
}

function bar(fraction, width = 24) {
  const filled = Math.round(fraction * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

function percent(numerator, denominator) {
  return denominator === 0 ? '  n/a' : `${((numerator / denominator) * 100).toFixed(0).padStart(4)}%`;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));

  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const model = process.env.AI_MODEL_CHEAP?.trim();
  const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 60_000;

  if (!model) {
    console.error('AI_MODEL_CHEAP must be set to the model id you want to score.');
    process.exit(2);
  }
  if (!baseUrl && !apiKey) {
    console.error('Set AI_BASE_URL for a self-hosted endpoint, or AI_API_KEY for a hosted one.');
    process.exit(2);
  }

  const endpoint = baseUrl || 'https://api.openai.com/v1';
  const rows = JSON.parse(fs.readFileSync(path.resolve(CORPUS_PATH), 'utf8')).filter(
    (row) => row.intent !== undefined,
  );
  const corpus = options.limit > 0 ? rows.slice(0, options.limit) : rows;

  console.log(`\n  model     ${model}`);
  console.log(`  endpoint  ${endpoint}`);
  console.log(`  phrases   ${corpus.length}\n`);

  const byLanguage = new Map();
  const failures = [];
  let intentHits = 0;
  let argHits = 0;
  let argTotal = 0;
  let errors = 0;
  const startedAt = Date.now();

  for (const row of corpus) {
    const result = await ask(endpoint, apiKey, model, row.text, timeoutMs);
    if (result.error) {
      errors += 1;
      failures.push({ row, reason: result.error });
      process.stdout.write('!');
      continue;
    }

    const score = scoreRow(row, result.parsed);
    if (score.intent) intentHits += 1;
    else failures.push({ row, reason: `got ${JSON.stringify(result.parsed?.intent ?? null)}` });

    argHits += score.args;
    argTotal += score.argsTotal;

    const language = row.language ?? 'unknown';
    const bucket = byLanguage.get(language) ?? { hits: 0, total: 0 };
    bucket.hits += score.intent ? 1 : 0;
    bucket.total += 1;
    byLanguage.set(language, bucket);

    process.stdout.write(score.intent ? '.' : 'x');
    if (options.verbose) {
      console.log(`\n  ${row.text}\n    → ${JSON.stringify(result.parsed)}`);
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('\n');
  console.log(`  intent      ${percent(intentHits, corpus.length)}  ${bar(intentHits / corpus.length)}  ${intentHits}/${corpus.length}`);
  console.log(`  arguments   ${percent(argHits, argTotal)}  ${bar(argTotal ? argHits / argTotal : 0)}  ${argHits}/${argTotal}`);
  console.log('');

  for (const [language, bucket] of [...byLanguage.entries()].sort()) {
    console.log(`  ${language.padEnd(10)}${percent(bucket.hits, bucket.total)}  ${bar(bucket.hits / bucket.total)}  ${bucket.hits}/${bucket.total}`);
  }

  console.log(`\n  ${seconds}s total, ${(Number(seconds) / corpus.length).toFixed(1)}s per phrase` +
    (errors > 0 ? `, ${errors} request error(s)` : ''));

  if (failures.length > 0) {
    console.log(`\n  Missed ${failures.length}:`);
    for (const { row, reason } of failures.slice(0, 20)) {
      console.log(`    ${row.text}\n      expected ${row.intent}, ${reason}`);
    }
    if (failures.length > 20) console.log(`    … and ${failures.length - 20} more`);
  }

  // A rough read, stated once so the number means something without a baseline to
  // compare against. These are not thresholds the build enforces.
  const accuracy = intentHits / corpus.length;
  console.log(
    '\n  ' +
      (accuracy >= 0.9
        ? 'Good enough to rely on.'
        : accuracy >= 0.75
          ? 'Usable, but expect the confirmation gate to earn its keep.'
          : 'Too unreliable — try a larger model, or --tool-mode json if you used native.') +
      '\n',
  );
}

await main();
