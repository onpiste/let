import { useEffect, useState } from "react";

import {
  GOOGLE_SERVICES,
  googleConnectUrl,
  type GoogleService,
  type GoogleStatus,
  type User
} from "@cot/shared";

import { api, type AgentHandle } from "../../lib/assistant-rpc";
import { errorText } from "../../lib/errors";

const SERVICES = Object.keys(GOOGLE_SERVICES) as GoogleService[];

/**
 * The Google account the user signed in with, and the services the assistant
 * may use with it. Connecting is a full-page trip to Google's consent screen
 * and back here, which works the same on a phone as on a desktop.
 */
export function GoogleSettings({
  user,
  agent,
  epoch
}: {
  user: User;
  agent: AgentHandle;
  epoch: number;
}) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (epoch === 0) return;
    api(agent)
      .getGoogleStatus()
      .then(setStatus)
      .catch((e: unknown) => setError(errorText(e)));
  }, [agent, epoch]);

  const disconnect = async () => {
    if (!confirm("Stop the assistant from using Gmail and Calendar?")) return;
    setError(null);
    try {
      setStatus(await api(agent).disconnectGoogle());
    } catch (e) {
      setError(errorText(e));
    }
  };

  const granted = status?.granted ?? [];

  return (
    <>
      <li>
        <div>
          <div className="font-medium">Google</div>
          <div className="muted small">Signed in as {user.email}</div>
        </div>
        <span className="pill ready">connected</span>
      </li>
      {SERVICES.map((service) => (
        <li key={service}>
          <div>
            <div className="font-medium">{GOOGLE_SERVICES[service].label}</div>
            <div className="muted small">
              {GOOGLE_SERVICES[service].description}
            </div>
          </div>
          {granted.includes(service) ? (
            <span className="pill ready">connected</span>
          ) : (
            <a
              className="primary-btn"
              href={googleConnectUrl(service, window.location.pathname)}
              aria-disabled={!status}
            >
              Connect
            </a>
          )}
        </li>
      ))}
      {granted.length > 0 && (
        <li>
          <button className="link-btn" onClick={() => void disconnect()}>
            Disconnect Google services
          </button>
        </li>
      )}
      {error && (
        <li>
          <p className="error">{error}</p>
        </li>
      )}
    </>
  );
}
