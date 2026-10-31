import { run } from "../proc";
import type { CalendarBackend, CalendarEvent, NewEvent } from "./types";

const SEP = "\t";
const FORMAT = [
  "{uid}",
  "{start-long}",
  "{end-long}",
  "{title}",
  "{location}"
].join(SEP);

async function khal(args: string[]) {
  const result = await run(["khal", ...args], {
    cwd: process.cwd(),
    timeoutMs: 30_000
  });
  if (result.exitCode !== 0) throw new Error(result.output.trim());
  return result.output;
}

/** khal prints local times; the dates it gets and returns are plain text. */
const stamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const clock = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const khalCalendar: CalendarBackend = {
  name: "khal",
  async list(from, to) {
    const out = await khal([
      "list",
      "--format",
      FORMAT,
      "--day-format",
      "",
      stamp(from),
      stamp(to)
    ]);
    return out
      .split("\n")
      .filter((line) => line.includes(SEP))
      .map((line): CalendarEvent => {
        const [id = "", start = "", end = "", title = "", location = ""] =
          line.split(SEP);
        return { id, title, start, end, location: location || undefined };
      });
  },
  // khal can create from the command line but has no scripted delete, so
  // `remove` is left out and the tool says so.
  async create(event: NewEvent) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const args = ["new"];
    if (event.calendar) args.push("-a", event.calendar);
    if (event.location) args.push("-l", event.location);
    args.push(stamp(start), clock(start), stamp(end), clock(end), event.title);
    if (event.notes) args.push("::", event.notes);
    await khal(args);
    return { id: "", ...event };
  }
};
