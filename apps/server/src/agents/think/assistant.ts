import { Think } from "@cloudflare/think";
import type { ThinkMessengers } from "@cloudflare/think/messengers";
import { callable, getCurrentAgent } from "agents";
import type { LanguageModel, UIMessage } from "ai";

import {
  toPublicSettings,
  type AssistantRpc,
  type EmailPolicy,
  type PushDevice,
  type SettingsPatch,
  type Skill,
  type WebPushSubscription
} from "@cot/shared";

import { isAllowed } from "../../auth/session";
import { EmailFeature } from "../../integrations/email/feature";
import { OwnerPush } from "../../integrations/push";
import { TelegramChannel } from "../../integrations/telegram/channel";
import { log } from "../../log/logger";
import { Chat } from "./chat";
import { ChatDirectory } from "./chat-directory";
import { ChatServices } from "./chat-services";
import { Connectors } from "./connectors";
import { ChatHistory } from "./history";
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
    return new EmailFeature({
      env: this.env,
      agent: this,
      store: this.store,
      owner: () => this.allowedOwner(),
      model: () => languageModelFor(this.store.getSettings(), this.env),
      notify: (notice) => this.notify(notice),
      triageLater: (id) => this.schedule(1, "triageNewEmail", id),
      startChat: (message) => this.chats.startWith(message)
    });
  }

  private get push() {
    return new OwnerPush(this.env, this);
  }

  private get connectors() {
    return new Connectors(this, this.env, this.store);
  }

  private get history() {
    return new ChatHistory(this);
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

  override onStart() {
    this.store.ensureTables();

    this.connectors.configureOAuth();
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
    return this.chats.gate(className, name);
  }

  /** What a chat uses of this assistant, over DO RPC (not a callable). */
  chatServices(chatId: string) {
    this.store.ensureTables();
    return new ChatServices(chatId, {
      env: this.env,
      agent: this,
      store: this.store,
      history: this.history,
      research: this.research,
      email: this.email,
      mcp: this.mcp,
      notifyMessenger: (text) => this.telegram.notify(text),
      notifyTask: (description, reply) =>
        this.notify(reminderNotice(description, reply))
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

  // ── Connectors (callables): MCP servers and one-tap apps ──────────

  @callable()
  async addMcp(name: string, url: string) {
    return this.connectors.addMcp(name, url);
  }

  @callable()
  removeMcp(id: string) {
    return this.connectors.removeMcp(id);
  }

  @callable()
  async listApps() {
    return this.connectors.apps.status();
  }

  @callable()
  async connectApp(slug: string) {
    return this.connectors.apps.connect(slug);
  }

  @callable()
  async disconnectApp(slug: string) {
    return this.connectors.apps.disconnect(slug);
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
    return this.email.channel.status();
  }

  @callable()
  async setEmailAlias(alias: string) {
    return this.email.channel.setAlias(alias);
  }

  @callable()
  async updateEmailPolicy(policy: EmailPolicy) {
    return this.email.channel.updatePolicy(policy);
  }

  @callable()
  async listInbox(archived: boolean, offset: number) {
    return this.email.mailbox.page(archived, offset);
  }

  @callable()
  async openEmail(id: number) {
    return this.email.mailbox.open(id);
  }

  @callable()
  async archiveEmail(id: number, archived: boolean) {
    this.email.mailbox.archive(id, archived);
  }

  @callable()
  async markAllEmailsRead() {
    this.email.mailbox.markAllRead();
  }

  @callable()
  async askAboutEmail(id: number) {
    return this.email.mailbox.ask(id);
  }

  /** Called by the Worker's email handler with the raw message. */
  async receiveEmail(envelopeFrom: string, raw: Uint8Array) {
    this.store.ensureTables();
    return this.email.channel.receive(envelopeFrom, raw);
  }

  /**
   * Reads a new email and tells the owner what it is, without being asked.
   * Scheduled by receiveEmail, which has already made the tables.
   */
  async triageNewEmail(id: number) {
    await this.email.triage(id);
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
    await this.email.channel.status();
  }

  async addMemory(content: string) {
    this.store.addMemory(content);
  }

  async removeMemory(id: number) {
    this.store.removeMemory(id);
  }

  // ── Scheduled tasks fire here ───────────────────────────────────────

  /**
   * Carries the task out as a turn in the chat in use; the chat tells the
   * owner the result when the turn ends (ChatServices.taskDone). If the turn
   * can't even be queued, the owner still gets the bare reminder.
   */
  async executeTask(description: string) {
    try {
      await this.chats.runTask(description);
    } catch (error) {
      log.error("tasks", "Running a scheduled task failed", error);
      await this.notify(reminderNotice(description, null));
    }
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
