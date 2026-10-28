import type { ChatSummary } from "./chats";
import type { EmailCategory, EmailPolicy, EmailStatus } from "./email";
import type { PublicSettings, SettingsPatch } from "./settings";
import type { ScheduledTask } from "./tasks";
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
  /** Saved conversations, newest first; the active one is flagged. */
  listChats(): Promise<ChatSummary[]>;
  /** Saves the active conversation and starts an empty one. */
  newChat(): Promise<ChatSummary[]>;
  /** Saves the active conversation and makes a saved one active. */
  openChat(id: string): Promise<ChatSummary[]>;
  deleteChat(id: string): Promise<ChatSummary[]>;
  /** Scheduled tasks, active ones by next run, then paused ones. */
  listTasks(): Promise<ScheduledTask[]>;
  pauseTask(id: string): Promise<ScheduledTask[]>;
  resumeTask(id: string): Promise<ScheduledTask[]>;
  deleteTask(id: string): Promise<ScheduledTask[]>;
  getSettings(): Promise<PublicSettings>;
  updateSettings(patch: SettingsPatch): Promise<PublicSettings>;
  addMcp(name: string, url: string): Promise<AddMcpResult>;
  removeMcp(id: string): Promise<void>;
  getTelegramStatus(): Promise<TelegramStatus>;
  connectTelegram(token: string): Promise<TelegramStatus>;
  newTelegramClaimLink(): Promise<TelegramStatus>;
  disconnectTelegram(): Promise<TelegramStatus>;
  getEmailStatus(): Promise<EmailStatus>;
  setEmailAlias(alias: string): Promise<EmailStatus>;
  updateEmailPolicy(policy: EmailPolicy): Promise<EmailStatus>;
}

/** Messages the server pushes to connected clients outside the chat stream. */
export type ServerEvent =
  | { type: "reminder"; description: string; timestamp: string }
  | {
      type: "email";
      from: string;
      subject: string;
      /** False for mail from a stranger. */
      trusted: boolean;
      /** Set once the assistant has read the mail; absent if it couldn't. */
      category?: EmailCategory;
      summary?: string;
      timestamp: string;
    };
