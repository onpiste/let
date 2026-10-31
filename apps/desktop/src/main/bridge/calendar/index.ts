import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveInRoots } from "../paths";
import type { Policy } from "../policy";
import { defineTool, type ToolContext } from "../tools/define";
import { failure, text } from "../tools/result";
import { which } from "../which";
import { icsCalendar } from "./ics";
import { khalCalendar } from "./khal";
import { macosCalendar } from "./macos";
import { outlookCalendar } from "./outlook";
import { reminders } from "./reminders";
import type { CalendarBackend } from "./types";

async function pickBackend(policy: Policy): Promise<CalendarBackend | null> {
  const choice = policy.calendar;
  const name =
    choice !== "auto"
      ? choice
      : process.platform === "darwin"
        ? "macos"
        : process.platform === "win32"
          ? "outlook"
          : which("khal")
            ? "khal"
            : "ics";
  if (name === "macos") return macosCalendar;
  if (name === "outlook") return outlookCalendar;
  if (name === "khal") return khalCalendar;
  // The .ics file must be somewhere the policy allows.
  return icsCalendar(await resolveInRoots(policy.roots, policy.icsPath));
}

const day = 24 * 60 * 60 * 1000;

export async function registerCalendarTools(
  server: McpServer,
  ctx: ToolContext
) {
  const backend = await pickBackend(ctx.policy).catch(() => null);
  if (!backend) return;

  defineTool(
    server,
    ctx,
    "calendar_list",
    `List events from the user's calendar (${backend.name}) between two moments. Use ISO 8601 with the user's timezone offset.`,
    z.object({
      from: z
        .string()
        .describe("Start of the range, e.g. 2026-10-31T00:00:00+08:00"),
      to: z
        .string()
        .optional()
        .describe("End of the range; defaults to 7 days after from")
    }),
    async ({ from, to }) => {
      try {
        const start = new Date(from);
        const end = to ? new Date(to) : new Date(start.getTime() + 7 * day);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return failure("from and to must be ISO 8601 dates.");
        }
        const events = await backend.list(start, end);
        return text(
          events.length ? JSON.stringify(events, null, 1) : "(no events)"
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  defineTool(
    server,
    ctx,
    "calendar_create",
    `Add an event to the user's calendar (${backend.name}). Use ISO 8601 with the user's timezone offset.`,
    z.object({
      title: z.string(),
      start: z.string(),
      end: z.string(),
      location: z.string().optional(),
      notes: z.string().optional(),
      calendar: z
        .string()
        .optional()
        .describe("Calendar name; default if omitted"),
      allDay: z.boolean().optional()
    }),
    async (event) => {
      try {
        if ([event.start, event.end].some((d) => Number.isNaN(Date.parse(d)))) {
          return failure("start and end must be ISO 8601 dates.");
        }
        return text(JSON.stringify(await backend.create(event), null, 1));
      } catch (error) {
        return failure(error);
      }
    }
  );

  if (backend.remove) {
    const remove = backend.remove.bind(backend);
    defineTool(
      server,
      ctx,
      "calendar_delete",
      "Delete a calendar event by the id calendar_list returned.",
      z.object({ id: z.string() }),
      async ({ id }) => {
        try {
          await remove(id);
          return text("Deleted.");
        } catch (error) {
          return failure(error);
        }
      }
    );
  }

  if (backend !== macosCalendar) return;
  registerReminderTools(server, ctx);
}

function registerReminderTools(server: McpServer, ctx: ToolContext) {
  const json = async (work: Promise<unknown>) => {
    try {
      return text(JSON.stringify(await work, null, 1));
    } catch (error) {
      return failure(error);
    }
  };
  defineTool(
    server,
    ctx,
    "reminders_list",
    "List the user's Reminders (macOS), open ones unless includeDone is true.",
    z.object({
      list: z.string().optional(),
      includeDone: z.boolean().optional()
    }),
    (args) => json(reminders.list(args))
  );
  defineTool(
    server,
    ctx,
    "reminders_add",
    "Add a reminder to the user's Reminders (macOS). due is optional ISO 8601.",
    z.object({
      title: z.string(),
      notes: z.string().optional(),
      due: z.string().optional(),
      list: z.string().optional()
    }),
    (args) => json(reminders.add(args))
  );
  defineTool(
    server,
    ctx,
    "reminders_complete",
    "Mark a reminder done by the id reminders_list returned.",
    z.object({ id: z.string() }),
    async ({ id }) => {
      try {
        await reminders.complete(id);
        return text("Done.");
      } catch (error) {
        return failure(error);
      }
    }
  );
}
