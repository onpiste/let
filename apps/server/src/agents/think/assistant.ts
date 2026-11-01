import { Think } from "@cloudflare/think";
import type { ThinkMessengers } from "@cloudflare/think/messengers";
import { callable, getCurrentAgent } from "agents";
import type { LanguageModel, UIMessage } from "ai";

import {
  MCP_CALLBACK_PATH,
  toPublicSettings,
  type AssistantRpc,
  type EmailPolicy,
  type PushDevice,
  type SettingsPatch,
  type Skill,
  type WebPushSubscription
} from "@cot/shared";

import { isAllowed } from "../../auth/session";
import { EmailChannel } from "../../integrations/email/channel";
import { emailAddress } from "../../integrations/email/config";
import { Inbox } from "../../integrations/email/inbox";
import { emailNotice, triagedNotice } from "../../integrations/email/notice";
import type { ParsedEmail } from "../../integrations/email/parse";
import { OwnerPush } from "../../integrations/push";
import { TelegramChannel } from "../../integrations/telegram/channel";
import { Chat } from "./chat";
import { ChatDirectory } from "./chat-directory";
import { ChatServices } from "./chat-services";
import { ChatHistory } from "./history";
import { mcpPopupResult } from "./mcp-popup";
import { languageModelFor, modelFor } from "./model";
import { notifyOwner, reminderNotice, researchNotice } from "./notices";
import { ResearchJobs } from "./research-jobs";
import { deleteSkill, saveSkill } from "./skill-save";
import { AssistantStore } from "./store";
import { Tasks } from "./tasks";

/**
 * A personal assistant. Each signed-in Google account gets its own Durable
 * Object instance, which keeps that person's settings, long-term memories,
 * skills, scheduled reminders and the catalog of their chats.
 *
 * Each conversation is a `Chat` agent (chat.ts), a facet of this one, so
 * several can answer at once; they reach back for the user's state through
 * `chatServices`. This class exposes the callables in AssistantRpc. It
 * extends Think only to host the Telegram messenger, which writes into the
 * chat last used (integrations/telegram). Its own email address files
 * incoming mail in an inbox (integrations/email).
 *
 * Only the signed-in owner can reach an instance (see http/router.ts).
 */
export class Assistant extends Think<Env> implements AssistantRpc {
  // Getters, not fields: Think calls getMessengers() before field init.
  private get store() {
    return new AssistantStore(this);
  }

  private get telegram() {
    return new TelegramChannel({
      env: this.env,
      userId: () => this.name.slice("google:".length),
      store: this.store,
      ownerAllowed: () => this.allowedOwner() !== null,
      // Restart after the current reply goes out so Think re-reads the bot.
      onBotChanged: () => {
        setTimeout(() => this.ctx.abort("Telegram bot changed"), 500);
      }
    });
  }

  private get email() {
    return new EmailChannel({
      env: this.env,
      userId: () => this.name.slice("google:".length),
      store: this.store,
      inbox: () => new Inbox(this),
      owner: () => this.allowedOwner(),
      ownerName: () => this.store.getOwnerName(),
      onEmail: (id, email, trusted, preview) =>
        this.onEmail(id, email, trusted, preview)
    });
  }

  private get push() {
    return new OwnerPush(this.env, this);
  }

  private get history() {
    const history = new ChatHistory(this);
    history.ensureTables();
    return history;
  }

  private get research() {
    return new ResearchJobs(this, this.env, this.store, (topic, ok) =>
      this.notify(researchNotice(topic, ok))
    );
  }

  /** The owner's email while it is still in ALLOWED_EMAILS. */
  private allowedOwner() {
    const email = this.store.getOwnerEmail();
    return email && isAllowed(email, this.env) ? email : null;
  }

  private emailAddress() {
    return emailAddress(this.store.getEmailConfig(), this.env.EMAIL_DOMAIN);
  }

  override onStart() {
    this.store.ensureTables();

    // MCP OAuth opens in a popup; close it and let the settings page pick
    // up the new connection state from the MCP broadcast.
    this.mcp.configureOAuthCallback({ customHandler: mcpPopupResult });
  }

  // ── Think hooks: turns run in the chats, not here ────────────────────

  override getModel(): string | LanguageModel {
    return modelFor(this.store.getSettings());
  }

  override getMessengers(): ThinkMessengers {
    this.store.ensureTables();
    return this.telegram.messengers(async () => ({
      target: "subagent",
      agentClass: Chat,
      name: await this.currentChat()
    }));
  }

  // ── Chats (callables) ───────────────────────────────────────────────

  private directory: ChatDirectory | null = null;

  private get chats() {
    this.directory ??= new ChatDirectory(this, () => this.history);
    return this.directory;
  }

  @callable()
  async listChats() {
    return this.chats.list();
  }

  @callable()
  async currentChat() {
    return this.chats.current();
  }

  @callable()
  async newChat() {
    return this.chats.create();
  }

  @callable()
  async openChat(id: string) {
    return this.chats.open(id);
  }

  @callable()
  async deleteChat(id: string) {
    return this.chats.remove(id);
  }

  @callable()
  async searchChats(query: string) {
    return this.chats.find(query);
  }

  /** Only chats this assistant created can be reached from outside. */
  override async onBeforeSubAgent(
    _request: Request,
    { className, name }: { className: string; name: string }
  ) {
    await this.chats.ready();
    if (className !== Chat.name || !this.chats.exists(name)) {
      return new Response("Not found", { status: 404 });
    }
    return undefined;
  }

  /** What a chat uses of this assistant, over DO RPC (not a callable). */
  chatServices(chatId: string) {
    this.store.ensureTables();
    const address = this.emailAddress();
    return new ChatServices(chatId, {
      env: this.env,
      agent: this,
      store: this.store,
      history: this.history,
      research: this.research,
      inbox: address ? new Inbox(this) : null,
      emailAddress: address,
      mcp: this.mcp,
      notifyMessenger: (text) => this.telegram.notify(text)
    });
  }

  /** Adds a message to a chat without a turn (research-jobs.ts). */
  async postToChat(chatId: string | null, message: UIMessage) {
    await this.chats.post(chatId, message);
  }

  // ── Scheduled tasks (callables) ─────────────────────────────────────

  @callable()
  async listTasks() {
    return new Tasks(this).list();
  }

  @callable()
  async pauseTask(id: string) {
    return new Tasks(this).pause(id);
  }

  @callable()
  async resumeTask(id: string) {
    return new Tasks(this).resume(id);
  }

  @callable()
  async deleteTask(id: string) {
    return new Tasks(this).remove(id);
  }

  // ── Settings (callables) ────────────────────────────────────────────

  @callable()
  async getSettings() {
    return toPublicSettings(this.store.getSettings());
  }

  @callable()
  async updateSettings(patch: SettingsPatch) {
    return toPublicSettings(this.store.updateSettings(patch));
  }

  // ── Skills (callables) ──────────────────────────────────────────────

  @callable()
  async listSkills() {
    return this.store.listSkills();
  }

  @callable()
  async saveSkill(skill: Skill) {
    return saveSkill(this.store, skill);
  }

  @callable()
  async deleteSkill(name: string) {
    return deleteSkill(this.store, name);
  }

  // ── MCP servers (callables). Think adds their tools to every turn. ──

  @callable()
  async addMcp(name: string, url: string) {
    if (!name.trim()) throw new Error("Give the server a name.");
    if (!/^https?:\/\//.test(url)) throw new Error("Enter an http(s) URL.");
    return this.addMcpServer(name.trim(), url.trim(), {
      callbackPath: MCP_CALLBACK_PATH
    });
  }

  @callable()
  removeMcp(id: string) {
    return this.removeMcpServer(id);
  }

  // ── Telegram (callables + webhook RPC) ──────────────────────────────

  @callable()
  async getTelegramStatus() {
    return this.telegram.status();
  }

  @callable()
  async connectTelegram(token: string) {
    return this.telegram.connect(token, getCurrentAgent().connection?.uri);
  }

  @callable()
  async newTelegramClaimLink() {
    return this.telegram.newClaimLink();
  }

  @callable()
  async disconnectTelegram() {
    return this.telegram.disconnect();
  }

  /** Called by the Worker for each webhook update. */
  async receiveTelegramUpdate(secret: string, body: string) {
    this.store.ensureTables();
    return this.telegram.receive(secret, body);
  }

  // ── Push notifications (callables) ──────────────────────────────────

  @callable()
  async registerPushDevice(device: PushDevice) {
    return this.push.apns.register(device);
  }

  @callable()
  async getWebPushKey() {
    return this.push.web.publicKey();
  }

  @callable()
  async registerWebPush(subscription: WebPushSubscription) {
    return this.push.web.register(subscription);
  }

  // ── Email (callables + Worker RPC) ──────────────────────────────────

  @callable()
  async getEmailStatus() {
    return this.email.status();
  }

  @callable()
  async setEmailAlias(alias: string) {
    return this.email.setAlias(alias);
  }

  @callable()
  async updateEmailPolicy(policy: EmailPolicy) {
    return this.email.updatePolicy(policy);
  }

  /** Called by the Worker's email handler with the raw message. */
  async receiveEmail(envelopeFrom: string, raw: Uint8Array) {
    this.store.ensureTables();
    return this.email.receive(envelopeFrom, raw);
  }

  private async onEmail(
    id: number,
    email: ParsedEmail,
    trusted: boolean,
    preview: string | null
  ) {
    // Gmail's forwarding confirmation is passed on as is: the owner needs its
    // link now. Everything else is read by the model first.
    if (preview !== null)
      return this.notify(
        emailNotice({ ...email, trusted, triage: null, preview })
      );
    await this.schedule(1, "triageNewEmail", id);
  }

  /** Reads a new email and tells the owner what it is, without being asked. */
  async triageNewEmail(id: number) {
    this.store.ensureTables();
    const model = () => languageModelFor(this.store.getSettings(), this.env);
    const notice = await triagedNotice(new Inbox(this), model, id);
    if (notice) await this.notify(notice);
  }

  /** Tells the owner outside the chat: open clients, Telegram, push. */
  private notify(notice: Parameters<typeof notifyOwner>[2]) {
    const channels = { telegram: this.telegram, push: this.push };
    return notifyOwner(this, channels, notice);
  }

  // ── RPC for the Worker ─────────────────────────────────────────

  /** The owner's email and name, recorded by the Worker on every web connection. */
  async setOwner(email: string, name: string) {
    this.store.ensureTables();
    this.store.setOwner(email, name);
    // The inbox tools and the prompt's email section only exist once the
    // address is allocated, so don't wait for the settings page to do it.
    await this.email.status();
  }

  async addMemory(content: string) {
    this.store.addMemory(content);
  }

  async removeMemory(id: number) {
    this.store.removeMemory(id);
  }

  // ── Scheduled reminders fire here ───────────────────────────────────

  async executeTask(description: string) {
    await this.notify(reminderNotice(description));
  }

  @callable()
  async listResearch() {
    return this.research.list();
  }

  /** Polls a Deep Research run until its report is in the chat. */
  async checkResearch(id: string) {
    await this.research.check(id);
  }
}
