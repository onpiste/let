import type { GoogleAccount } from "./account";

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type EventTime = { dateTime?: string; date?: string; timeZone?: string };
type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: EventTime;
  end?: EventTime;
  attendees?: { email: string; responseStatus?: string }[];
  htmlLink?: string;
};

function brief(event: CalendarEvent) {
  return {
    id: event.id,
    summary: event.summary ?? "(no title)",
    start: event.start?.dateTime ?? event.start?.date,
    end: event.end?.dateTime ?? event.end?.date,
    location: event.location,
    attendees: event.attendees?.map((a) => a.email),
    link: event.htmlLink
  };
}

/** Events on the primary calendar in [from, to), recurring ones expanded. */
export async function listEvents(
  google: GoogleAccount,
  { from, to, query }: { from: string; to: string; query?: string }
) {
  const params = new URLSearchParams({
    timeMin: from,
    timeMax: to,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50"
  });
  if (query) params.set("q", query);
  const result = await google.json<{
    items?: CalendarEvent[];
    timeZone?: string;
  }>(`${API}?${params.toString()}`);
  return {
    timeZone: result.timeZone,
    events: (result.items ?? []).map(brief)
  };
}

export type NewEvent = {
  summary: string;
  /** RFC 3339 date-time with offset, or YYYY-MM-DD for an all-day event. */
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
};

function toEventTime(value: string): EventTime {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { date: value }
    : { dateTime: value };
}

export async function createEvent(google: GoogleAccount, event: NewEvent) {
  const created = await google.json<CalendarEvent>(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: toEventTime(event.start),
      end: toEventTime(event.end),
      attendees: event.attendees?.map((email) => ({ email }))
    })
  });
  return brief(created);
}
