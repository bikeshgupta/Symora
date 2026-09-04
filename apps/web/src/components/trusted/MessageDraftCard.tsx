import { useState } from 'react';
import { CardShell } from './CardShell';
import { Button } from '@/components/ui/button';
import type { DraftVariantWithHandoff } from '@symora/core';

const VARIANT_LABEL: Record<string, string> = { short: 'Short', detailed: 'Warmer' };

/**
 * Both drafted variants with their one-tap handoff links.
 *
 * The links are plain anchors to `wa.me` and `mailto:` URLs built server-side by pure
 * functions. Symora never sends anything in V1 — the user opens the prefilled message
 * and presses send themselves — so there is deliberately no "send" action here.
 *
 * The message text is model-written and is rendered as text, never as markup: no
 * `dangerouslySetInnerHTML` anywhere in this component
 * (.claude/rules/auth-security.md § Input and output safety).
 */
export function MessageDraftCard({ variants }: { variants: DraftVariantWithHandoff[] }) {
  const [copiedVariant, setCopiedVariant] = useState<string | null>(null);

  async function handleCopy(variant: DraftVariantWithHandoff) {
    try {
      await navigator.clipboard.writeText(variant.text);
      setCopiedVariant(variant.variant);
      window.setTimeout(() => setCopiedVariant(null), 2000);
    } catch {
      // Clipboard access can be denied or unavailable. The text is on screen and
      // selectable regardless, so this does not warrant an error state.
    }
  }

  return (
    <CardShell as="section">
      <h2 className="text-heading text-text-primary">Two versions</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Pick one and open it in WhatsApp or email. Symora doesn&apos;t send it — you do.
      </p>

      <ul className="mt-4 flex flex-col gap-4">
        {variants.map((variant) => (
          <li key={variant.variant} className="rounded-md border border-border bg-surface-raised p-4">
            <p className="text-caption text-text-muted">
              {VARIANT_LABEL[variant.variant] ?? variant.variant}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-body-sm text-text-primary">{variant.text}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={variant.handoff.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-body-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                WhatsApp
              </a>
              <a
                href={variant.handoff.mailtoUrl}
                className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-surface px-4 text-body-sm font-medium text-text-primary hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Email
              </a>
              <Button type="button" variant="ghost" onClick={() => void handleCopy(variant)}>
                {copiedVariant === variant.variant ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
