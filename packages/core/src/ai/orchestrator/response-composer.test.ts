import { describe, expect, it } from 'vitest';
import { composeConfirmation } from './response-composer';

/**
 * The confirmation card is the gate on every high-impact write, and it is now also where
 * a user corrects a misparse. That makes the field list part of the contract: each field
 * has to name the argument it came from, or an edit has nowhere to be written back to.
 */
describe('composeConfirmation fields', () => {
  const args = {
    accountName: 'Home loan',
    obligationType: 'emi',
    amount: 75000,
    currency: 'INR',
    dueDay: 5,
    recurrenceRule: 'monthly',
    confidence: 0.9,
  };

  it('names the argument each field came from', () => {
    const { ui } = composeConfirmation('create_financial_obligation', args);
    const fields = ui?.component === 'confirmation-prompt' ? ui.props.fields : [];

    expect(fields.map((f) => f.key)).toEqual([
      'accountName',
      'obligationType',
      'amount',
      'currency',
      'dueDay',
      'recurrenceRule',
    ]);
  });

  it('leaves confidence out — it is pipeline bookkeeping, not a value to approve', () => {
    const { ui } = composeConfirmation('create_financial_obligation', args);
    const fields = ui?.component === 'confirmation-prompt' ? ui.props.fields : [];

    expect(fields.some((f) => f.key === 'confidence')).toBe(false);
    // Still present in args, so confirming re-posts the same parsed call.
    expect((ui?.component === 'confirmation-prompt' ? ui.props.args : null)).toMatchObject({
      confidence: 0.9,
    });
  });

  it('picks an editor from the parsed value, so a correction round trips as the same type', () => {
    const { ui } = composeConfirmation('create_financial_obligation', {
      ...args,
      paidDate: '2026-09-05',
    });
    const fields = ui?.component === 'confirmation-prompt' ? ui.props.fields : [];
    const editorFor = (key: string) => fields.find((f) => f.key === key)?.editor;

    expect(editorFor('amount')).toBe('number');
    expect(editorFor('dueDay')).toBe('number');
    expect(editorFor('paidDate')).toBe('date');
    expect(editorFor('accountName')).toBe('text');
  });

  it('keeps the human label and the formatted value alongside the key', () => {
    const { ui } = composeConfirmation('create_financial_obligation', args);
    const fields = ui?.component === 'confirmation-prompt' ? ui.props.fields : [];

    expect(fields[0]).toEqual({
      key: 'accountName',
      label: 'Account Name',
      value: 'Home loan',
      editor: 'text',
    });
  });

  it('falls back to text for anything an input cannot round trip', () => {
    const { ui } = composeConfirmation('create_task', { title: 'x', tags: ['a', 'b'] });
    const fields = ui?.component === 'confirmation-prompt' ? ui.props.fields : [];

    expect(fields.find((f) => f.key === 'tags')?.editor).toBe('text');
  });
});
