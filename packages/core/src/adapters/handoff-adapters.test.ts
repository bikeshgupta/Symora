import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, normalizePhone } from './whatsapp-adapter';
import { buildMailtoLink } from './mailto-adapter';

describe('normalizePhone', () => {
  it('adds the default country code to a bare 10-digit number', () => {
    expect(normalizePhone('9876543210')).toBe('919876543210');
  });

  it('strips formatting characters', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('(987) 654 3210')).toBe('919876543210');
  });

  it('leaves a number that already carries a country code alone', () => {
    expect(normalizePhone('+1 415 555 0123')).toBe('14155550123');
  });

  it('returns null rather than guessing at something unusable', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('not a phone number')).toBeNull();
  });
});

describe('buildWhatsAppLink', () => {
  it('builds a wa.me link with the recipient and the prefilled text', () => {
    const link = buildWhatsAppLink({
      channel: 'whatsapp',
      recipientPhone: '9876543210',
      text: 'Hi Ashok, are you free Saturday?',
    });
    expect(link.url).toBe('https://wa.me/919876543210?text=Hi%20Ashok%2C%20are%20you%20free%20Saturday%3F');
  });

  it('omits the recipient when the number is unusable, rather than opening a wrong chat', () => {
    const link = buildWhatsAppLink({ channel: 'whatsapp', recipientPhone: 'nope', text: 'Hello' });
    expect(link.url).toBe('https://wa.me/?text=Hello');
  });

  it('encodes newlines and characters that would otherwise break the query', () => {
    const link = buildWhatsAppLink({ channel: 'whatsapp', text: 'Line one\nLine two & more' });
    expect(link.url).toContain('%0A');
    expect(link.url).toContain('%26');
    expect(link.url).not.toContain('\n');
  });

  it('encodes Devanagari text', () => {
    const link = buildWhatsAppLink({ channel: 'whatsapp', text: 'नमस्ते' });
    expect(link.url.startsWith('https://wa.me/?text=%')).toBe(true);
    expect(decodeURIComponent(link.url.split('text=')[1]!)).toBe('नमस्ते');
  });
});

describe('buildMailtoLink', () => {
  it('builds a bare mailto when there is nothing to prefill', () => {
    expect(buildMailtoLink({}).url).toBe('mailto:');
  });

  it('puts the recipient before the query and the rest after it', () => {
    const link = buildMailtoLink({
      to: ['ashok@example.com'],
      subject: 'Saturday visit',
      body: 'Are you free?',
    });
    expect(link.url).toBe('mailto:ashok@example.com?subject=Saturday%20visit&body=Are%20you%20free%3F');
  });

  it('separates multiple addresses with a literal comma, not an encoded one', () => {
    const link = buildMailtoLink({ to: ['a@example.com', 'b@example.com'] });
    expect(link.url).toBe('mailto:a@example.com,b@example.com');
  });

  it('carries cc and bcc', () => {
    const link = buildMailtoLink({ to: ['a@example.com'], cc: ['c@example.com'], bcc: ['d@example.com'] });
    expect(link.url).toContain('cc=c@example.com');
    expect(link.url).toContain('bcc=d@example.com');
  });

  it('preserves a multi-paragraph body as %0A', () => {
    const link = buildMailtoLink({ body: 'Para one.\n\nPara two.' });
    expect(link.url).toBe('mailto:?body=Para%20one.%0A%0APara%20two.');
  });

  it('escapes characters that would change meaning inside a query value', () => {
    const link = buildMailtoLink({ body: "It's (urgent)!" });
    expect(link.url).not.toMatch(/[!'()]/);
    expect(decodeURIComponent(link.url.split('body=')[1]!)).toBe("It's (urgent)!");
  });

  it('does not let a crafted subject inject another query parameter', () => {
    const link = buildMailtoLink({ to: ['a@example.com'], subject: 'Hi&bcc=attacker@example.com' });
    expect(link.url).not.toContain('&bcc=attacker@example.com');
    expect(link.url).toContain('%26bcc%3Dattacker%40example.com');
  });
});
