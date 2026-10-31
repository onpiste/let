import { osascript, runScript } from "./script";
import type { CalendarBackend, CalendarEvent, NewEvent } from "./types";

// JXA for the Calendar app. Arguments arrive as JSON in COT_ARGS. Calendar's
// scripting interface does not expand recurring events, so only each series'
// own occurrence is listed.
const PRELUDE = `
ObjC.import('stdlib');
const args = JSON.parse(ObjC.unwrap($.getenv('COT_ARGS')));
const Cal = Application('Calendar');
const iso = (d) => d.toISOString();
const shape = (e, cal) => ({
  id: e.uid(), title: e.summary(), start: iso(e.startDate()), end: iso(e.endDate()),
  location: e.location() || undefined, notes: e.description() || undefined,
  calendar: cal.name(), allDay: e.alldayEvent()
});
`;

const LIST = `${PRELUDE}
const from = new Date(args.from), to = new Date(args.to);
const out = [];
for (const cal of Cal.calendars()) {
  const found = cal.events.whose({_and: [
    {startDate: {_lessThan: to}}, {endDate: {_greaterThan: from}}
  ]})();
  for (const e of found) out.push(shape(e, cal));
}
out.sort((a, b) => a.start.localeCompare(b.start));
JSON.stringify(out);
`;

const CREATE = `${PRELUDE}
const cal = args.calendar ? Cal.calendars.byName(args.calendar) : Cal.defaultCalendar ? Cal.defaultCalendar() : Cal.calendars()[0];
const e = Cal.Event({
  summary: args.title, startDate: new Date(args.start), endDate: new Date(args.end),
  location: args.location || '', description: args.notes || '', alldayEvent: !!args.allDay
});
cal.events.push(e);
JSON.stringify(shape(e, cal));
`;

const REMOVE = `${PRELUDE}
let removed = false;
for (const cal of Cal.calendars()) {
  const found = cal.events.whose({uid: args.id})();
  for (const e of found) { Cal.delete(e); removed = true; }
}
JSON.stringify({removed});
`;

export const macosCalendar: CalendarBackend = {
  name: "macOS Calendar",
  async list(from, to) {
    return (await runScript(osascript(LIST), {
      from: from.toISOString(),
      to: to.toISOString()
    })) as CalendarEvent[];
  },
  async create(event: NewEvent) {
    return (await runScript(osascript(CREATE), event)) as CalendarEvent;
  },
  async remove(id) {
    const r = (await runScript(osascript(REMOVE), { id })) as {
      removed: boolean;
    };
    if (!r.removed) throw new Error(`No event with id ${id}.`);
  }
};
