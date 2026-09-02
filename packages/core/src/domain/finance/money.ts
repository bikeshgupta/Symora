/**
 * Exact money arithmetic (.claude/rules/finance-rules.md: "Never floating point
 * arithmetic on money"). Amounts are `numeric(12,2)` in Postgres and arrive here as
 * decimal strings; everything is done in integer minor units (paise/cents) via BigInt
 * so summing never accumulates float error.
 */

export function toMinorUnits(amount: string | number): bigint {
  const str = typeof amount === 'number' ? amount.toFixed(2) : amount;
  const parts = str.split('.');
  const wholeRaw = parts[0] ?? '0';
  const fractionRaw = parts[1] ?? '';
  const negative = wholeRaw.startsWith('-');
  const whole = wholeRaw.replace('-', '') || '0';
  const fraction = (fractionRaw + '00').slice(0, 2);
  const minor = BigInt(whole) * 100n + BigInt(fraction || '0');
  return negative ? -minor : minor;
}

export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function sumMinorUnits(amounts: (string | number)[]): bigint {
  return amounts.reduce<bigint>((total, amount) => total + toMinorUnits(amount), 0n);
}
