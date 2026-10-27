import { GOOGLE_SERVICES, type GoogleService } from "@cot/shared";

/** The scopes behind each service. Gmail's compose scope covers sending. */
export const SERVICE_SCOPES: Record<GoogleService, string[]> = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose"
  ],
  calendar: ["https://www.googleapis.com/auth/calendar.events"]
};

/** The user's Google grant, stored in their assistant. Never sent to a client. */
export type GoogleGrant = {
  refreshToken: string;
  /** Every scope granted so far (incremental grants accumulate). */
  scopes: string[];
  accessToken: string;
  /** Epoch ms after which `accessToken` must be refreshed. */
  expiresAt: number;
};

export function grantedServices(grant: GoogleGrant | null): GoogleService[] {
  if (!grant) return [];
  return (Object.keys(GOOGLE_SERVICES) as GoogleService[]).filter((service) =>
    SERVICE_SCOPES[service].every((scope) => grant.scopes.includes(scope))
  );
}
