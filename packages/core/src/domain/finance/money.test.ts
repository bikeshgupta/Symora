import { describe, expect, it } from 'vitest';
import { fromMinorUnits, sumMinorUnits, toMinorUnits } from './money';

describe('money (no floating point)', () => {
  it('converts decimal strings and numbers to exact minor units', () => {
    expect(toMinorUnits('42500.00')).toBe(4_250_000n);
    expect(toMinorUnits(42500)).toBe(4_250_000n);
    expect(toMinorUnits('0.1')).toBe(10n);
  });

  it('sums amounts that would lose precision under float addition', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754 float, but must be exact here.
    expect(sumMinorUnits(['0.10', '0.20'])).toBe(30n);
    expect(fromMinorUnits(sumMinorUnits(['0.10', '0.20']))).toBe('0.30');
  });

  it('round-trips through fromMinorUnits', () => {
    expect(fromMinorUnits(toMinorUnits('1234.56'))).toBe('1234.56');
  });
});
