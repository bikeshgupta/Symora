import { describe, expect, it } from 'vitest';
import {
  categorizePastedText,
  describeCategory,
  MAX_PASTE_CHARS,
  truncateForExtraction,
} from './paste-service';

describe('categorizePastedText', () => {
  it('recognises a payment confirmation', () => {
    expect(categorizePastedText('Rs 42,500 debited from your account towards Home Loan EMI')).toBe(
      'payment_confirmation',
    );
    expect(categorizePastedText('₹1,299 paid successfully. UPI txn 123456')).toBe('payment_confirmation');
  });

  it('recognises a renewal notice', () => {
    expect(categorizePastedText('Your policy no. XY123 is due for renewal on 30 Sep')).toBe('renewal_notice');
  });

  it('recognises a booking confirmation', () => {
    expect(categorizePastedText('Booking confirmed. PNR 4567891230')).toBe('booking_confirmation');
  });

  it('recognises an appointment', () => {
    expect(categorizePastedText('Your appointment with Dr Rao is scheduled for Monday 11am')).toBe(
      'appointment',
    );
  });

  it('falls back to other rather than guessing', () => {
    expect(categorizePastedText('hey, what time are we meeting?')).toBe('other');
  });

  it('is a label only — an unrecognised category still describes cleanly', () => {
    expect(describeCategory('other')).toBe('a message');
    expect(describeCategory('payment_confirmation')).toBe('a payment confirmation');
  });
});

describe('truncateForExtraction', () => {
  it('leaves short text untouched', () => {
    expect(truncateForExtraction('short')).toBe('short');
  });

  it('bounds a long paste', () => {
    const long = 'x'.repeat(MAX_PASTE_CHARS + 500);
    const truncated = truncateForExtraction(long);
    expect(truncated).toHaveLength(MAX_PASTE_CHARS + 1);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
