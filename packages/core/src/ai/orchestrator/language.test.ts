import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language';

describe('detectLanguage', () => {
  it('detects Hindi from Devanagari script', () => {
    expect(detectLanguage('घर का लोन हर महीने 5 तारीख को')).toBe('hi');
  });

  it('detects Hinglish from romanized Hindi function words', () => {
    expect(detectLanguage('Saturday electrician ko call karna.')).toBe('hinglish');
    expect(detectLanguage('Home loan kal pay kar diya.')).toBe('hinglish');
  });

  it('falls back to English for plain English text', () => {
    expect(detectLanguage('Home loan 42500 every month on 5th.')).toBe('en');
    expect(detectLanguage('This month what all is pending?')).toBe('en');
  });
});
