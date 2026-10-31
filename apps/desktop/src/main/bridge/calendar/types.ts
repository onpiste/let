export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO 8601 with offset (or a plain date for all-day events). */
  start: string;
  end: string;
  location?: string;
  notes?: string;
  calendar?: string;
  allDay?: boolean;
};

export type NewEvent = Omit<CalendarEvent, "id">;

export interface CalendarBackend {
  readonly name: string;
  list(from: Date, to: Date): Promise<CalendarEvent[]>;
  create(event: NewEvent): Promise<CalendarEvent>;
  /** Backends that can't delete from a script leave this out. */
  remove?(id: string): Promise<void>;
}
