import { describe, expect, it } from 'vitest';
import { capabilitySuggestions, composeSmallTalk, detectSmallTalk } from './small-talk';

describe('detectSmallTalk', () => {
  it('recognises a plain greeting in all three languages', () => {
    for (const text of [
      'hi',
      'Hii',
      'Hello',
      'Hello Symora',
      'hey there!',
      'Good morning',
      'namaste',
      'Namaste ji',
      'नमस्ते',
      'नमस्कार',
      'Salaam',
    ]) {
      expect(detectSmallTalk(text), text).toBe('greeting');
    }
  });

  it('recognises the pleasantry that follows one, with or without the opener', () => {
    for (const text of ['how are you', 'hi, how are you?', 'kaise ho', 'kya haal hai', 'सब ठीक है']) {
      expect(detectSmallTalk(text), text).toBe('greeting');
    }
  });

  it('recognises being asked outright what it can do', () => {
    for (const text of [
      'what can you do',
      'What can you do?',
      'help',
      'hi, what can you do?',
      'aap kya kar sakte ho',
      'आप क्या कर सकते हैं',
    ]) {
      expect(detectSmallTalk(text), text).toBe('capabilities');
    }
  });

  it('never swallows a real request that merely opens with a greeting', () => {
    // The whole point of matching the whole message: treating these as small talk would
    // silently drop the request inside them.
    for (const text of [
      'hi, remind me to call the doctor tomorrow',
      'hello, paid the electricity bill today',
      'namaste, home loan 42500 every month on the 5th',
      'help me draft a message to my landlord',
      'good morning meeting reminder at 9',
    ]) {
      expect(detectSmallTalk(text), text).toBeNull();
    }
  });

  it('ignores anything long enough to be a real message', () => {
    expect(detectSmallTalk(`hello ${'x'.repeat(120)}`)).toBeNull();
  });

  it('ignores an empty or punctuation-only message', () => {
    expect(detectSmallTalk('   ')).toBeNull();
    expect(detectSmallTalk('???')).toBeNull();
  });
});

describe('composeSmallTalk', () => {
  it('answers the question and offers five things to try', () => {
    const composed = composeSmallTalk('en', 'Bikesh Gupta');
    expect(composed.text).toContain('Hello, Bikesh');
    expect(composed.text).toContain('how can I help you today?');
    expect(composed.ui.component).toBe('suggestion-chips');
    expect(composed.ui).toMatchObject({ props: { suggestions: expect.any(Array) } });
    const props = (composed.ui as { props: { suggestions: unknown[] } }).props;
    expect(props.suggestions).toHaveLength(5);
  });

  it('invites the chips rather than repeating them as a wall of bullets', () => {
    const composed = composeSmallTalk('en', null);
    expect(composed.text).toContain('tap one to try it');
    expect(composed.text.split('\n').filter(Boolean)).toHaveLength(2);
    // Every capability is still offered — in the chips, which is where they are tappable.
    const props = (composed.ui as { props: { suggestions: { label: string }[] } }).props;
    expect(props.suggestions.map((s) => s.label)).toEqual(
      capabilitySuggestions('en').map((s) => s.label),
    );
  });

  it('greets without a name when there is none', () => {
    expect(composeSmallTalk('en', null).text.startsWith('Hello —')).toBe(true);
  });

  it('replies in the language the user greeted in', () => {
    expect(composeSmallTalk('hi', null).text).toContain('नमस्ते');
    expect(composeSmallTalk('hinglish', null).text).toContain('bataiye');
  });

  it('offers prompts the offline rule parser can also handle', async () => {
    // A first-run example that only works with a model configured would be a broken
    // promise on a deployment running without one.
    const { extractIntentOffline } = await import('../offline');
    const { buildTemporalAnchors } = await import('../../domain/temporal/temporal-context');
    const temporal = buildTemporalAnchors(new Date('2026-09-07T06:00:00.000Z'), 'Asia/Kolkata');
    for (const suggestion of capabilitySuggestions('en')) {
      const extraction = extractIntentOffline(suggestion.prompt, 'en', { temporal });
      expect(extraction.intent, suggestion.prompt).not.toBeNull();
    }
  });
});
