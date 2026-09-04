import { describe, expect, it } from 'vitest';
import { parseAmount } from './amount-parser';
import { parseDate, parseDueDay, parseLeadDays } from './date-parser';
import { buildTemporalAnchors } from '../../domain/temporal/temporal-context';

// Friday 2026-09-04, Kolkata.
const anchors = buildTemporalAnchors(new Date('2026-09-04T06:00:00.000Z'), 'Asia/Kolkata');

describe('parseAmount', () => {
  it('reads a plain figure with separators', () => {
    expect(parseAmount('Home loan 42,500 every month')?.amount).toBe(42500);
    expect(parseAmount('Home loan 42500 every month')?.amount).toBe(42500);
  });

  it('reads a currency-marked figure of any size', () => {
    expect(parseAmount('rs 50 for chai')?.amount).toBe(50);
    expect(parseAmount('₹1,299 paid')?.amount).toBe(1299);
  });

  it('expands Indian shorthand', () => {
    expect(parseAmount('rent 15k monthly')?.amount).toBe(15000);
    expect(parseAmount('1.5 lakh premium')?.amount).toBe(150000);
    expect(parseAmount('2 crore')?.amount).toBe(20000000);
  });

  it('detects the currency when marked, and defaults to INR otherwise', () => {
    expect(parseAmount('$40 subscription')?.currency).toBe('USD');
    expect(parseAmount('40000 rent')?.currency).toBe('INR');
  });

  it('does not read a day-of-month as money', () => {
    // "on the 5th" must never become ₹5 — a confident, plausible, wrong write.
    expect(parseAmount('remind me on the 5th')).toBeNull();
    expect(parseAmount('5 tarikh ko')).toBeNull();
  });

  it('does not read a lead time or a date as money', () => {
    expect(parseAmount('remind me 2 days before')).toBeNull();
    expect(parseAmount('due on 2026-09-05')).toBeNull();
  });

  it('picks the amount and not the due day when both are present', () => {
    expect(parseAmount('Home loan 42500 every month on 5th')?.amount).toBe(42500);
  });

  it('returns null when there is no figure at all', () => {
    expect(parseAmount('call the electrician')).toBeNull();
  });
});

describe('parseDate', () => {
  it('resolves absolute and simple relative forms', () => {
    expect(parseDate('due 2026-12-01', anchors)?.date).toBe('2026-12-01');
    expect(parseDate('do it today', anchors)?.date).toBe('2026-09-04');
    expect(parseDate('do it tomorrow', anchors)?.date).toBe('2026-09-05');
    expect(parseDate('paid yesterday', anchors)?.date).toBe('2026-09-03');
  });

  it('reads kal as the past when the tense is past', () => {
    const parsed = parseDate('kal wali EMI bhar diya', anchors);
    expect(parsed?.date).toBe('2026-09-03');
    expect(parsed?.wasAmbiguous).toBe(false);
  });

  it('reads kal as the future when the tense is future', () => {
    const parsed = parseDate('kal EMI bharna hai', anchors);
    expect(parsed?.date).toBe('2026-09-05');
    expect(parsed?.wasAmbiguous).toBe(false);
  });

  it('flags kal as ambiguous when nothing settles the direction', () => {
    expect(parseDate('kal EMI', anchors)?.wasAmbiguous).toBe(true);
  });

  it('treats parso as two days either side', () => {
    expect(parseDate('parso jana hai', anchors)?.date).toBe('2026-09-06');
    expect(parseDate('parso kar diya', anchors)?.date).toBe('2026-09-02');
  });

  it('counts forward for "in N days" and its Hinglish forms', () => {
    expect(parseDate('in 5 days', anchors)?.date).toBe('2026-09-09');
    expect(parseDate('agle 5 din me', anchors)?.date).toBe('2026-09-09');
    expect(parseDate('3 din baad', anchors)?.date).toBe('2026-09-07');
  });

  it('resolves a weekday to the coming occurrence', () => {
    expect(parseDate('Saturday electrician ko call karna', anchors)?.date).toBe('2026-09-05');
    expect(parseDate('shanivar ko', anchors)?.date).toBe('2026-09-05');
  });

  it('reads a named date in either order and infers the year', () => {
    expect(parseDate('birthday on 25 December', anchors)?.date).toBe('2026-12-25');
    expect(parseDate('birthday on December 25', anchors)?.date).toBe('2026-12-25');
    // Already passed this year, so it means next year.
    expect(parseDate('anniversary on 1 March', anchors)?.date).toBe('2027-03-01');
  });

  it('returns null rather than guessing when there is no date', () => {
    expect(parseDate('call the electrician', anchors)).toBeNull();
  });
});

describe('parseDueDay / parseLeadDays', () => {
  it('reads the day of month in both phrasings', () => {
    expect(parseDueDay('every month on 5th')).toBe(5);
    expect(parseDueDay('har mahine 15 tarikh')).toBe(15);
    expect(parseDueDay('on the 31st')).toBe(31);
  });

  it('rejects an impossible day', () => {
    expect(parseDueDay('on the 45th')).toBeNull();
  });

  it('reads a lead time in both phrasings', () => {
    expect(parseLeadDays('remind me 2 days before every bill')).toBe(2);
    expect(parseLeadDays('3 din pehle yaad dilana')).toBe(3);
  });

  it('returns null when no lead time is stated', () => {
    expect(parseLeadDays('remind me on Saturday')).toBeNull();
  });
});
