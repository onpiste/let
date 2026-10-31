import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CalendarBackend, CalendarEvent, NewEvent } from "./types";

const EMPTY =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Cot//Desktop//EN\r\nEND:VCALENDAR\r\n";

/** RFC 5545 §3.1: a line that starts with a space continues the previous. */
const unfold = (text: string) =>
  text
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter((l) => l !== "");

const unescape = (v: string) =>
  v.replace(/\\([nN,;\\])/g, (_m, c: string) =>
    c === "n" || c === "N" ? "\n" : c
  );
const escape = (v: string) =>
  v.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Folds at 75 octets' worth of characters, a safe approximation. */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 70) {
    parts.push((i === 0 ? "" : " ") + line.slice(i, i + 70));
  }
  return parts.join("\r\n");
}

/** 20261030T100000Z / 20261030T100000 / 20261030 → ISO. TZID is read as local time. */
function parseDate(value: string): { iso: string; allDay: boolean } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
    value
  );
  if (!m) return { iso: value, allDay: false };
  const [, y = "", mo = "", d = "", h, mi, s, z] = m;
  if (h === undefined) return { iso: `${y}-${mo}-${d}`, allDay: true };
  const stamp = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  return {
    iso: new Date(z ? `${stamp}Z` : stamp).toISOString(),
    allDay: false
  };
}

const formatUtc = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

function parseEvents(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let current: Record<string, string> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT" && current) {
      const start = parseDate(current.DTSTART ?? "");
      const end = parseDate(current.DTEND ?? current.DTSTART ?? "");
      events.push({
        id: current.UID ?? "",
        title: unescape(current.SUMMARY ?? ""),
        start: start.iso,
        end: end.iso,
        location: current.LOCATION ? unescape(current.LOCATION) : undefined,
        notes: current.DESCRIPTION ? unescape(current.DESCRIPTION) : undefined,
        allDay: start.allDay
      });
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon > 0) {
        const name = line.slice(0, colon).split(";")[0] ?? "";
        current[name.toUpperCase()] = line.slice(colon + 1);
      }
    }
  }
  return events;
}

async function readCalendar(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return EMPTY;
  }
}

async function save(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, path);
}

/** A calendar kept in one .ics file, readable by every calendar app. */
export function icsCalendar(path: string): CalendarBackend {
  return {
    name: "ICS file",
    async list(from, to) {
      const events = parseEvents(await readCalendar(path));
      return events
        .filter((e) => new Date(e.start) < to && new Date(e.end) > from)
        .toSorted((a, b) => a.start.localeCompare(b.start));
    },
    async create(event: NewEvent) {
      const id = `${randomUUID()}@cot`;
      const when = (iso: string, name: string) =>
        event.allDay
          ? `${name};VALUE=DATE:${iso.slice(0, 10).replaceAll("-", "")}`
          : `${name}:${formatUtc(iso)}`;
      const lines = [
        "BEGIN:VEVENT",
        `UID:${id}`,
        `DTSTAMP:${formatUtc(new Date().toISOString())}`,
        when(event.start, "DTSTART"),
        when(event.end, "DTEND"),
        `SUMMARY:${escape(event.title)}`,
        ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
        ...(event.notes ? [`DESCRIPTION:${escape(event.notes)}`] : []),
        "END:VEVENT"
      ].map(fold);
      const text = await readCalendar(path);
      const base = text.includes("END:VCALENDAR") ? text : EMPTY;
      const at = base.lastIndexOf("END:VCALENDAR");
      await save(
        path,
        `${base.slice(0, at)}${lines.join("\r\n")}\r\n${base.slice(at)}`
      );
      return { id, ...event };
    },
    async remove(id) {
      const text = await readCalendar(path);
      const lines = text.split(/\r?\n/);
      const kept: string[] = [];
      let block: string[] = [];
      let inEvent = false;
      let removed = false;
      for (const line of lines) {
        if (line === "BEGIN:VEVENT") {
          inEvent = true;
          block = [line];
        } else if (inEvent) {
          block.push(line);
          if (line === "END:VEVENT") {
            inEvent = false;
            // Compare unfolded text, since a long UID may wrap.
            const hit = unfold(block.join("\r\n")).includes(`UID:${id}`);
            if (hit) removed = true;
            else kept.push(...block);
          }
        } else {
          kept.push(line);
        }
      }
      if (!removed) throw new Error(`No event with id ${id}.`);
      await save(path, kept.join("\r\n"));
    }
  };
}
