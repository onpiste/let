import type { User } from "@cot/shared";

import type { Policy } from "../main/bridge/policy";
import type { Activity } from "../main/bridge/tools/define";

export type { Policy };

export type TunnelView =
  | { status: "off" }
  | { status: "starting" }
  | { status: "up"; url: string }
  | { status: "error"; error: string };

export type LinkView =
  | { status: "idle" }
  | { status: "registering" }
  | { status: "registered" }
  | { status: "error"; error: string };

/** Everything the settings window shows. Secrets never appear in it. */
export type DesktopState = {
  origin: string;
  user: User | null;
  /** The token expired or was refused. */
  needsSignIn: boolean;
  tunnel: TunnelView;
  link: LinkView;
  policy: Policy;
  activity: Activity[];
  tunnelHost: string;
  hasTunnelToken: boolean;
  platform: string;
};

/** What the window may ask the app to do (exposed by the preload script). */
export type DesktopApi = {
  getState: () => Promise<DesktopState>;
  onState: (listener: (state: DesktopState) => void) => () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  rotateSecret: () => Promise<void>;
  setPolicy: (patch: Partial<Policy>) => Promise<void>;
  setOrigin: (origin: string) => Promise<void>;
  setTunnel: (host: string, token: string) => Promise<void>;
  pickFolder: () => Promise<string | null>;
  copyMcpUrl: () => Promise<boolean>;
};
