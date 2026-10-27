import type { JobInfo, NewJob } from "./schedules";
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
  getTelegramStatus(): Promise<TelegramStatus>;
  connectTelegram(token: string): Promise<TelegramStatus>;
  newTelegramClaimLink(): Promise<TelegramStatus>;
  disconnectTelegram(): Promise<TelegramStatus>;
  /** Every scheduled reminder and task, soonest first. */
  listJobs(): Promise<JobInfo[]>;
  createJob(job: NewJob): Promise<JobInfo>;
  /** Resolves false when no job has this id. */
  cancelJob(id: string): Promise<boolean>;
}

/** Messages the server pushes to connected clients outside the chat stream. */
export type ServerEvent =
  | { type: "reminder"; description: string; timestamp: string }
  | {
      /** A scheduled task finished; `text` is the reply or the error. */
      type: "task-result";
      description: string;
      ok: boolean;
      text: string;
      timestamp: string;
    };
