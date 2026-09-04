/**
 * Mapping a commitment's urgency to a status tone and label.
 *
 * Lives outside the component file so StatusBadge.tsx exports components only — mixing
 * the two breaks React Fast Refresh for that module.
 */

import type { CommitmentUrgency } from '@symora/core';

export type StatusTone = 'overdue' | 'due-soon' | 'paid' | 'neutral';

export function urgencyTone(urgency: CommitmentUrgency | null): StatusTone {
  switch (urgency) {
    case 'overdue':
      return 'overdue';
    case 'due-today':
    case 'due-soon':
      return 'due-soon';
    default:
      return 'neutral';
  }
}

export function urgencyLabel(urgency: CommitmentUrgency | null, dueDate: string | null): string {
  switch (urgency) {
    case 'overdue':
      return `Overdue · ${dueDate ?? ''}`.trim();
    case 'due-today':
      return 'Due today';
    case 'due-soon':
      return `Due ${dueDate ?? 'soon'}`;
    case 'upcoming':
      return `Due ${dueDate ?? ''}`.trim();
    default:
      return 'No date';
  }
}
