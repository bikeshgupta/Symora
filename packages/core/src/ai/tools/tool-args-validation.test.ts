/**
 * Phase 9 — .claude/rules/ai-pipeline.md § Typed tool registry: "Every tool declares a
 * Zod schema for its arguments; arguments are validated before the handler runs.
 * Invalid arguments are a rejected tool call, not a coerced one."
 *
 * `validateToolArgs` is how a caller finds that out without running the tool, so a
 * malformed call becomes a question rather than a 500.
 */

import { describe, expect, it } from 'vitest';
import { validateToolArgs } from './registry';
import { INTENT_NAMES } from '../../types/intents';

describe('validateToolArgs', () => {
  it('accepts a well-formed call and returns the parsed arguments', () => {
    const result = validateToolArgs('create_task', { title: 'Call the plumber', confidence: 0.9 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args).toMatchObject({ title: 'Call the plumber' });
  });

  it('strips `confidence` so it never reaches a domain service', () => {
    const result = validateToolArgs('create_task', { title: 'Call the plumber', confidence: 0.9 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.args as Record<string, unknown>)).not.toContain('confidence');
  });

  it('never accepts a user_id, whatever spelling the model uses', () => {
    const result = validateToolArgs('create_task', {
      title: 'Call the plumber',
      user_id: 'someone-else',
      userId: 'someone-else',
      confidence: 0.9,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.args)).not.toContain('someone-else');
  });

  it('names the field that is missing rather than failing anonymously', () => {
    const result = validateToolArgs('create_task', { confidence: 0.95 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields).toContain('title');
  });

  it('rejects a wrongly-typed amount instead of coercing it', () => {
    const result = validateToolArgs('create_financial_obligation', {
      accountName: 'Home loan',
      obligationType: 'emi',
      amount: 'forty two thousand five hundred',
      currency: 'INR',
      dueDay: 5,
      recurrenceRule: 'monthly',
      confidence: 0.99,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields).toContain('amount');
  });

  it('rejects a due day outside a calendar month', () => {
    const result = validateToolArgs('create_financial_obligation', {
      accountName: 'Rent',
      obligationType: 'rent',
      amount: 18000,
      currency: 'INR',
      dueDay: 47,
      recurrenceRule: 'monthly',
      confidence: 0.99,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields).toContain('dueDay');
  });

  it('rejects null, a string and an array where an argument object was expected', () => {
    for (const args of [null, 'title=x', ['title'], 42]) {
      expect(validateToolArgs('create_task', args).ok, `accepted ${JSON.stringify(args)}`).toBe(false);
    }
  });

  it('reports something for every intent when handed nothing, so no tool can be run bare', () => {
    for (const intent of INTENT_NAMES) {
      const result = validateToolArgs(intent, {});
      if (result.ok) continue;
      expect(result.fields.length, `${intent} rejected with no field named`).toBeGreaterThan(0);
    }
  });
});
