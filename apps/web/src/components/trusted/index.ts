/**
 * The V1 trusted component allowlist (.claude/rules/ai-pipeline.md § Output safety).
 *
 * The server returns a UI schema naming one of these; the renderer maps that name to a
 * component here and nothing else. Model output never becomes markup, and a name outside
 * this set renders nothing rather than falling back to something arbitrary.
 */

export { CardShell } from './CardShell';
export { StatusPill, type StatusTone } from './StatusPill';
export { AttentionCard } from './AttentionCard';
export { PaymentSummary } from './PaymentSummary';
export { CommitmentList } from './CommitmentList';
export { TaskList } from './TaskList';
export { ConfirmationCard } from './ConfirmationCard';
export { MessageDraftCard } from './MessageDraftCard';
export { SuggestionChip } from './SuggestionChip';
