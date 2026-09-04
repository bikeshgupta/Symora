import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDraftMessage, type DraftRequest } from '@/hooks/useDrafts';
import type { DraftVariantWithHandoff } from '@symora/core';

const VARIANT_LABEL: Record<string, string> = {
  short: 'Short',
  detailed: 'Warmer',
};

/**
 * One drafted variant plus its handoff links.
 *
 * The links are plain anchors, not scripted navigation: WhatsApp and the user's mail
 * client are external apps, and the whole point of the V1 handoff is that the user sees
 * the prefilled message and presses send themselves — Symora never sends anything
 * (PROGRESS.md Phase 5).
 */
function DraftVariantCard({ variant }: { variant: DraftVariantWithHandoff }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(variant.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied or unavailable; the text is on screen and
      // selectable either way, so this is not worth an error state.
    }
  }

  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <p className="text-caption text-text-muted">{VARIANT_LABEL[variant.variant] ?? variant.variant}</p>
      <p className="mt-1 whitespace-pre-wrap text-body-sm text-text-primary">{variant.text}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={variant.handoff.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-body-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Open in WhatsApp
        </a>
        <a
          href={variant.handoff.mailtoUrl}
          className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-surface-raised px-4 text-body-sm font-medium text-text-primary hover:bg-surface"
        >
          Open in email
        </a>
        <Button type="button" variant="ghost" onClick={() => void handleCopy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </li>
  );
}

/**
 * Message drafting and one-tap handoff (PROGRESS.md Phase 5). Both variants come back
 * from a single AI call; the links are built server-side by pure functions.
 */
export function DraftPanel() {
  const [form, setForm] = useState<DraftRequest>({ context: '' });
  const draft = useDraftMessage();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.context.trim()) return;
    draft.mutate({
      ...form,
      context: form.context.trim(),
      recipientRelationship: form.recipientRelationship?.trim() || undefined,
      recipientPhone: form.recipientPhone?.trim() || undefined,
    });
  }

  return (
    <Card>
      <h2 className="text-heading text-text-primary">Draft a message</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Symora writes two versions and hands them to WhatsApp or your email app. It never
        sends anything itself — you review it and press send.
      </p>

      <form className="mt-4" onSubmit={handleSubmit}>
        <Label htmlFor="draft-context" className="block">
          What does it need to say?
        </Label>
        <Input
          id="draft-context"
          value={form.context}
          onChange={(event) => setForm({ ...form, context: event.target.value })}
          placeholder="Ask the electrician to come Saturday morning"
        />

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="draft-relationship" className="block">
              Who is it for? (optional)
            </Label>
            <Input
              id="draft-relationship"
              value={form.recipientRelationship ?? ''}
              onChange={(event) => setForm({ ...form, recipientRelationship: event.target.value })}
              placeholder="electrician"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="draft-phone" className="block">
              Their number (optional)
            </Label>
            <Input
              id="draft-phone"
              value={form.recipientPhone ?? ''}
              onChange={(event) => setForm({ ...form, recipientPhone: event.target.value })}
              placeholder="98765 43210"
            />
          </div>
        </div>

        <Button type="submit" className="mt-3" disabled={draft.isPending || !form.context.trim()}>
          {draft.isPending ? 'Drafting…' : 'Draft it'}
        </Button>
      </form>

      {draft.isError && (
        <p className="mt-3 text-body-sm text-overdue">
          {draft.error instanceof Error ? draft.error.message : 'Could not draft that.'}
        </p>
      )}

      {draft.data && (
        <ul className="mt-4 flex flex-col gap-3">
          {draft.data.variants.map((variant) => (
            <DraftVariantCard key={variant.variant} variant={variant} />
          ))}
        </ul>
      )}
    </Card>
  );
}
