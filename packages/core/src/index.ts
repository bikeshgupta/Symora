export * from './types';
export * from './config/feature-flags';
export * from './config/runtime-mode';
export * from './config/ai-config';
export * from './repositories';
export * from './adapters';
export * from './ai';
export * as commitmentsService from './domain/commitments/commitments-service';
export * as tasksService from './domain/tasks/tasks-service';
export * as remindersService from './domain/reminders/reminders-service';
export * as financeService from './domain/finance/finance-service';
export * as memoryService from './domain/memory/memory-service';
export * from './domain/drafting/draft-service';
export * from './domain/drafting/handoff';
export * from './domain/drafting/paste-service';

/**
 * Types the API layer needs by name. The services themselves stay namespaced above so
 * call sites read as `financeService.getSummary(...)`, but their result types have to be
 * importable directly for handler response typing.
 */
export type {
  FinanceSummary,
  InstanceView,
  CreateObligationResult,
  MarkPaidResult,
  MonthlyRequirementResult,
  UpcomingPayment,
} from './domain/finance/finance-service';
export type { InstanceState } from './domain/finance/instances';
export type { RecurrenceRule, DueUrgency } from './domain/commitments/recurrence';
export * as homeService from './domain/home/home-service';
export * as notificationService from './domain/notifications/notification-service';
export * as usageService from './domain/usage/usage-service';
export * as privacyService from './domain/privacy/privacy-service';
export type { UsageSummary } from './domain/usage/usage-service';
export type { DataExport, DeletionResult } from './domain/privacy/privacy-service';
export type { PlannedNotification } from './domain/notifications/notification-planner';
export type { NotificationInbox } from './domain/notifications/notification-service';
export type { HomePayload, AttentionItem, HomeGreeting, HomeSuggestion } from './domain/home/home-service';
export {
  buildTemporalAnchors,
  renderTemporalContext,
  hasAmbiguousRelativeDate,
  needsRelativeDateClarification,
  weekdayOf,
  nextWeekday,
  type TemporalAnchors,
} from './domain/temporal/temporal-context';
