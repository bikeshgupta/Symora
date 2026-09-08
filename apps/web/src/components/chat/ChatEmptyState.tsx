import { BellRing, BrainCircuit, CheckCircle2, PenLine, Repeat2 } from 'lucide-react';
// A value, so it comes from the browser-safe entry point rather than the server barrel
// (packages/core/src/client.ts). The same list the server offers when someone says hello,
// so the tour and the assistant cannot drift apart.
import { capabilitySuggestions, type CapabilitySuggestion } from '@symora/core/client';
import type { HomeGreeting, HomeSuggestion } from '@symora/core';
import { SuggestionChip } from '@/components/trusted';
import { SymoraMark } from './SymoraMark';
import type { Me } from '@/hooks/useMe';

const GREETING_WORD: Record<HomeGreeting['partOfDay'], string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

/**
 * Which icon stands for each capability. Keyed on the ids the server defines, with a
 * fallback, so a capability added there renders rather than crashing the screen.
 */
const ICON: Record<string, typeof Repeat2> = {
  'cap-payment': Repeat2,
  'cap-paid': CheckCircle2,
  'cap-reminder': BellRing,
  'cap-memory': BrainCircuit,
  'cap-draft': PenLine,
};

function CapabilityCard({
  capability,
  onSelect,
}: {
  capability: CapabilitySuggestion;
  onSelect: (prompt: string) => void;
}) {
  const Icon = ICON[capability.id] ?? PenLine;

  return (
    <button
      type="button"
      onClick={() => onSelect(capability.prompt)}
      className="group flex min-h-[44px] w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Icon size={16} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-body-sm font-medium leading-tight text-text-primary">
          {capability.label}
        </span>
        <span className="mt-0.5 block truncate text-caption leading-tight text-text-muted">
          &ldquo;{capability.prompt}&rdquo;
        </span>
      </span>
    </button>
  );
}

/**
 * The chat screen before anything has been said.
 *
 * It answers the question a new user actually has — "what do I type?" — with five things
 * that work, taken from the same list the server sends when someone says hello
 * (packages/core/src/ai/orchestrator/small-talk.ts). One source, so the tour cannot drift
 * from what the assistant claims it can do.
 *
 * Tapping a card fills the composer rather than sending: the user sees the sentence
 * before it becomes a request, which is the same rule the mic follows.
 */
export function ChatEmptyState({
  greeting,
  me,
  suggestions,
  onSelect,
}: {
  greeting?: HomeGreeting;
  me?: Me;
  suggestions: HomeSuggestion[];
  onSelect: (prompt: string) => void;
}) {
  const firstName = (greeting?.displayName ?? me?.displayName)?.trim().split(/\s+/)[0] ?? null;
  const capabilities = capabilitySuggestions(me?.preferredLanguage ?? 'en');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-1 py-4 text-center sm:py-10">
      <SymoraMark size="md" />

      <h1 className="mt-3 text-title text-text-primary">
        {greeting ? `${GREETING_WORD[greeting.partOfDay]}${firstName ? `, ${firstName}` : ''}` : 'Hello'}
      </h1>
      <p className="mt-1 text-body-sm text-text-muted">
        What can I help you with? English, Hindi or Hinglish.
      </p>

      <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
        {capabilities.map((capability) => (
          <CapabilityCard key={capability.id} capability={capability} onSelect={onSelect} />
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-5 w-full">
          <p className="text-caption text-text-muted">Picking up where you are</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <SuggestionChip
                key={suggestion.id}
                label={suggestion.label}
                onSelect={() => onSelect(suggestion.prompt)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
