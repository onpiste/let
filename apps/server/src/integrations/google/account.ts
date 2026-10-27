import type { GoogleService, GoogleStatus } from "@cot/shared";

import { grantedServices, type GoogleGrant } from "./grant";
import { refreshAccessToken, revokeToken, type TokenResponse } from "./oauth";

type GrantStore = {
  getGoogleGrant(): GoogleGrant | null;
  saveGoogleGrant(grant: GoogleGrant | null): void;
};

/** Refresh a minute early so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * The user's Google grant, as one assistant uses it: status for the settings
 * page, and authorised fetches for the Gmail and Calendar tools.
 */
export class GoogleAccount {
  constructor(private readonly deps: { env: Env; store: GrantStore }) {}

  status(): GoogleStatus {
    return { granted: this.granted() };
  }

  granted(): GoogleService[] {
    return grantedServices(this.deps.store.getGoogleGrant());
  }

  save(tokens: TokenResponse) {
    const previous = this.deps.store.getGoogleGrant();
    const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
    if (!refreshToken) {
      throw new Error("Google returned no refresh token; connect again.");
    }
    this.deps.store.saveGoogleGrant({
      refreshToken,
      scopes: tokens.scope.split(" ").filter(Boolean),
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    });
  }

  async disconnect(): Promise<GoogleStatus> {
    const grant = this.deps.store.getGoogleGrant();
    this.deps.store.saveGoogleGrant(null);
    // Best effort: the grant is gone from the assistant either way.
    if (grant) await revokeToken(grant.refreshToken).catch(() => undefined);
    return this.status();
  }

  /** A Google API request with the user's token, refreshed when needed. */
  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await this.accessToken()}`);
    return fetch(url, { ...init, headers });
  }

  /** Like `fetch`, but parses JSON and turns API errors into thrown text. */
  async json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(url, init);
    if (!response.ok) {
      throw new Error(
        `Google API ${response.status}: ${(await response.text()).slice(0, 500)}`
      );
    }
    // Trust boundary: the caller names the shape of the Google API reply.
    return (await response.json()) as T;
  }

  private async accessToken() {
    const grant = this.deps.store.getGoogleGrant();
    if (!grant) throw new Error("Google isn't connected.");
    if (grant.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return grant.accessToken;
    }
    const tokens = await refreshAccessToken(this.deps.env, grant.refreshToken);
    this.deps.store.saveGoogleGrant({
      ...grant,
      // A refresh may narrow the scopes if the user revoked one in Google.
      scopes: tokens.scope ? tokens.scope.split(" ") : grant.scopes,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    });
    return tokens.access_token;
  }
}
