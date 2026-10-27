import { AUTH_ROUTES } from "./routes";

/**
 * Google services the assistant can use with the account the user signed in
 * with. Each is granted on its own (incremental authorization), so connecting
 * one is a single consent screen and no extra sign-in.
 */
export const GOOGLE_SERVICES = {
  gmail: {
    label: "Gmail",
    description: "Search and read email, draft replies, send with approval"
  },
  calendar: {
    label: "Google Calendar",
    description: "See your schedule and add events with approval"
  }
} as const;

export type GoogleService = keyof typeof GOOGLE_SERVICES;

export function isGoogleService(value: unknown): value is GoogleService {
  return typeof value === "string" && Object.hasOwn(GOOGLE_SERVICES, value);
}

/** What a client sees of the Google grant. Tokens never leave the server. */
export type GoogleStatus = { granted: GoogleService[] };

/**
 * Where a client sends the user to grant a service. A full-page navigation,
 * not a popup, so it works the same in a phone browser.
 */
export function googleConnectUrl(service: GoogleService, returnTo = "/") {
  return `${AUTH_ROUTES.googleConnect}?service=${service}&returnTo=${encodeURIComponent(returnTo)}`;
}
