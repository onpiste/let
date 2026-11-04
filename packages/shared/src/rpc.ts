import type { AppsStatus } from "./apps";
import type { ChatSummary } from "./chats";
import type {
  EmailCategory,
  EmailDetail,
  EmailPolicy,
  EmailStatus,
  InboxPage
} from "./email";
import type { PushDevice, PushStatus, WebPushSubscription } from "./push";
import type { ResearchJob } from "./research";
import type { PublicSettings, SettingsPatch } from "./settings";
import type { Skill } from "./skills";
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
  /**
   * Conversations with at least one message, newest first. Switching between
   * them never interrupts a reply: each runs in its own agent.
   */
  listChats(): Promise<ChatSummary[]>;
  /** The chat to open on start: the one last used, or a new empty one. */
  currentChat(): Promise<string>;
  /** Creates an empty chat and returns its id, for `chatSocketPath`. */
  newChat(): Promise<string>;
  /** Marks a chat as the one in use (Telegram follows it). */
  openChat(id: string): Promise<ChatSummary[]>;
  /** Deletes a chat, stopping a reply that is still running in it. */
  deleteChat(id: string): Promise<ChatSummary[]>;
  /**
   * Conversations whose title or text contains `query` (case-insensitive),
   * newest first, each with a `snippet` around the match.
   */
  searchChats(query: string): Promise<ChatSummary[]>;
  /** Scheduled tasks, active ones by next run, then paused ones. */
  listTasks(): Promise<ScheduledTask[]>;
  pauseTask(id: string): Promise<ScheduledTask[]>;
  resumeTask(id: string): Promise<ScheduledTask[]>;
  deleteTask(id: string): Promise<ScheduledTask[]>;
  getSettings(): Promise<PublicSettings>;
  updateSettings(patch: SettingsPatch): Promise<PublicSettings>;
  addMcp(name: string, url: string): Promise<AddMcpResult>;
  removeMcp(id: string): Promise<void>;
  /** One-tap apps (Gmail, Notion, …) and whether each is connected. */
  listApps(): Promise<AppsStatus>;
  /** A sign-in page to open for the app; listApps shows it once done. */
  connectApp(slug: string): Promise<{ url: string }>;
  disconnectApp(slug: string): Promise<AppsStatus>;
  /** The user's skills, by name. */
  listSkills(): Promise<Skill[]>;
  /** Adds a skill, or replaces the one with the same name. */
  saveSkill(skill: Skill): Promise<Skill[]>;
  deleteSkill(name: string): Promise<Skill[]>;
  getTelegramStatus(): Promise<TelegramStatus>;
  connectTelegram(token: string): Promise<TelegramStatus>;
  newTelegramClaimLink(): Promise<TelegramStatus>;
  disconnectTelegram(): Promise<TelegramStatus>;
  getEmailStatus(): Promise<EmailStatus>;
  setEmailAlias(alias: string): Promise<EmailStatus>;
  updateEmailPolicy(policy: EmailPolicy): Promise<EmailStatus>;
  /**
   * Received mail, newest first, `INBOX_PAGE_SIZE` from `offset`, with the
   * unread count for the badge.
   */
  listInbox(archived: boolean, offset: number): Promise<InboxPage>;
  /** One email, marked read; null if it was never there. */
  openEmail(id: number): Promise<EmailDetail | null>;
  archiveEmail(id: number, archived: boolean): Promise<void>;
  /**
   * Starts a new chat in which the assistant reads the email and says what
   * it is and what to do; returns the chat's id, now the one in use.
   */
  askAboutEmail(id: number): Promise<string>;
  /** Saves a phone's APNs token so reminders and mail reach it when the app is closed. */
  registerPushDevice(device: PushDevice): Promise<PushStatus>;
  /** The VAPID public key browsers subscribe with; null when Web Push is off. */
  getWebPushKey(): Promise<string | null>;
  /** Saves a browser's Web Push subscription, the web app's counterpart of registerPushDevice. */
  registerWebPush(subscription: WebPushSubscription): Promise<PushStatus>;
  /** Deep Research runs still going, oldest first. */
  listResearch(): Promise<ResearchJob[]>;
}

/** Messages the server pushes to connected clients outside the chat stream. */
export type ServerEvent =
  | { type: "reminder"; description: string; timestamp: string }
  /** A Deep Research run ended; its report (or error) is now in the chat. */
  | { type: "research"; topic: string; ok: boolean; timestamp: string }
  /** The running Deep Research runs changed: one started, was checked or ended. */
  | { type: "research-jobs"; jobs: ResearchJob[] }
  /** Mail was read or (un)archived on some client; the badge's new count. */
  | { type: "inbox"; unread: number }
  | {
      type: "email";
      /** Opens it with `openEmail`; `inboxPath(id)` on the web. */
      id: number;
      /** Unread mail outside the archive, this one included. */
      unread: number;
      from: string;
      subject: string;
      /** False for mail from a stranger. */
      trusted: boolean;
      /** Set once the assistant has read the mail; absent if it couldn't. */
      category?: EmailCategory;
      summary?: string;
      timestamp: string;
    };
