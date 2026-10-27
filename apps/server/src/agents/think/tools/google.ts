import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { GoogleAccount } from "../../../integrations/google/account";
import { createEvent, listEvents } from "../../../integrations/google/calendar";
import {
  createDraft,
  readEmail,
  searchEmail,
  sendEmail
} from "../../../integrations/google/gmail";

/** Runs a Google call, returning errors as text so the model can recover. */
async function attempt<T>(what: string, call: () => Promise<T>) {
  try {
    return await call();
  } catch (error) {
    return `Error ${what}: ${String(error)}`;
  }
}

const outgoingEmail = z.object({
  to: z.string().describe("Recipient address(es), comma-separated"),
  subject: z
    .string()
    .default("")
    .describe("Subject; leave empty when replying to keep the thread's"),
  body: z.string().describe("Plain-text body"),
  cc: z.string().optional(),
  replyToId: z
    .string()
    .optional()
    .describe("Id of the email being answered, to reply in its thread")
});

function gmailTools(google: GoogleAccount) {
  return {
    searchEmail: tool({
      description:
        "Search the user's Gmail with Gmail search syntax (e.g. 'is:unread newer_than:2d', 'from:anna invoice'). Returns sender, subject, date and a snippet for each message.",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query"),
        max: z.number().int().min(1).max(25).default(10)
      }),
      execute: ({ query, max }) =>
        attempt("searching Gmail", () => searchEmail(google, query, max))
    }),

    readEmail: tool({
      description: "Read one email in full by the id searchEmail returned.",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) =>
        attempt("reading the email", () => readEmail(google, id))
    }),

    draftEmail: tool({
      description:
        "Save an email (or a reply) as a Gmail draft for the user to review and send. Prefer this over sendEmail unless the user asked you to send.",
      inputSchema: outgoingEmail,
      execute: (email) =>
        attempt("saving the draft", () => createDraft(google, email))
    }),

    sendEmail: tool({
      description:
        "Send an email (or a reply) from the user's Gmail. Only when the user asked you to send it.",
      inputSchema: outgoingEmail,
      needsApproval: true,
      execute: (email) =>
        attempt("sending the email", () => sendEmail(google, email))
    })
  };
}

function calendarTools(google: GoogleAccount) {
  return {
    listEvents: tool({
      description:
        "List events on the user's primary Google Calendar between two times. Returns the calendar's time zone too.",
      inputSchema: z.object({
        from: z.string().describe("RFC 3339 start, e.g. 2026-10-27T00:00:00Z"),
        to: z.string().describe("RFC 3339 end (exclusive)"),
        query: z.string().optional().describe("Free-text filter")
      }),
      execute: (range) =>
        attempt("reading the calendar", () => listEvents(google, range))
    }),

    createEvent: tool({
      description:
        "Add an event to the user's primary Google Calendar. Attendees are added without being emailed.",
      inputSchema: z.object({
        summary: z.string(),
        start: z
          .string()
          .describe(
            "RFC 3339 date-time with offset, or YYYY-MM-DD for all day"
          ),
        end: z
          .string()
          .describe("Same format as start; for all day, the day after"),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.string()).optional().describe("Email addresses")
      }),
      needsApproval: true,
      execute: (event) =>
        attempt("creating the event", () => createEvent(google, event))
    })
  };
}

/** Tools for the Google services the user has granted, and only those. */
export function googleTools(google: GoogleAccount): ToolSet {
  const granted = google.granted();
  return {
    ...(granted.includes("gmail") ? gmailTools(google) : {}),
    ...(granted.includes("calendar") ? calendarTools(google) : {})
  };
}
