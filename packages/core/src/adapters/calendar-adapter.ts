/**
 * CalendarAdapter — INTERFACE ONLY. Do not implement in V1.
 *
 * Calendar integration is future scope. Declared now so commitments and important dates
 * can be modelled with a later sync in mind, without building one.
 *
 * There must be no implementation of this interface in V1, and no V1 code path may
 * depend on it.
 */

export interface CalendarEvent {
  externalId?: string;
  title: string;
  description?: string;
  /** Wall-clock start, interpreted in the supplied timezone. */
  start: Date;
  end?: Date;
  allDay: boolean;
  /** IANA timezone the event's wall-clock times belong to. */
  timezone: string;
  recurrenceRule?: string;
}

export interface CalendarAdapter {
  readonly name: string;
  listEvents(from: Date, to: Date): Promise<CalendarEvent[]>;
  createEvent(event: CalendarEvent): Promise<CalendarEvent>;
  updateEvent(externalId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent>;
  deleteEvent(externalId: string): Promise<void>;
}
