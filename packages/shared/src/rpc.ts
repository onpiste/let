import type { GoogleStatus } from "./google";
import type { PublicSettings, SettingsPatch } from "./settings";
import type { TelegramStatus } from "./telegram";

/** Result of adding an MCP server; OAuth servers return a URL to open. */
export type AddMcpResult =
  | { id: string; state: "ready" }
  | { id: string; state: "authenticating"; authUrl: string };

/**
 * The callable methods the Think assistant exposes over its WebSocket.
 *
 * The server's `Assistant` class implements this interface, so a change to a
 * signature breaks the build on both sides instead of at runtime.
 */
export interface AssistantRpc {
  getSettings(): Promise<PublicSettings>;
  updateSettings(patch: SettingsPatch): Promise<PublicSettings>;
  addMcp(name: string, url: string): Promise<AddMcpResult>;
  removeMcp(id: string): Promise<void>;
  getGoogleStatus(): Promise<GoogleStatus>;
  disconnectGoogle(): Promise<GoogleStatus>;
  getTelegramStatus(): Promise<TelegramStatus>;
  connectTelegram(token: string): Promise<TelegramStatus>;
  newTelegramClaimLink(): Promise<TelegramStatus>;
  disconnectTelegram(): Promise<TelegramStatus>;
}

/** Messages the server pushes to connected clients outside the chat stream. */
export type ServerEvent = {
  type: "reminder";
  description: string;
  timestamp: string;
};
