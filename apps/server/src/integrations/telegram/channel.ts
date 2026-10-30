import type { ThinkMessengers } from "@cloudflare/think/messengers";
import telegramMessenger from "@cloudflare/think/messengers/telegram";

import type { TelegramStatus } from "@cot/shared";

import { callTelegram, sendText } from "./bot-api";
import {
  newClaim,
  randomHex,
  toTelegramStatus,
  type TelegramConfig
} from "./config";
import { gateUpdate } from "./gate";
import { routes, webhookPath } from "./routes";

/** Where the channel keeps the bot config: the owning assistant's storage. */
export type TelegramConfigStore = {
  getTelegramConfig(): TelegramConfig | null;
  saveTelegramConfig(config: TelegramConfig | null): void;
};

export type TelegramUpdateResult = "unauthorized" | "handled" | "forward";

/**
 * One user's Telegram bot, as seen from their assistant. The assistant
 * exposes these methods as callables and webhook RPC; this class holds the
 * logic so the assistant only wires storage and lifecycle.
 */
export class TelegramChannel {
  constructor(
    private readonly options: {
      env: Env;
      /** The Google account id (`sub`) that owns the assistant. Read lazily:
       * the agent's name isn't set yet when Think asks for messengers. */
      userId: () => string;
      store: TelegramConfigStore;
      /** Whether the account is still in ALLOWED_EMAILS. */
      ownerAllowed: () => boolean;
      /** Think reads the messengers once at startup; restart to re-read. */
      onBotChanged: () => void;
    }
  ) {}

  private get config() {
    return this.options.store.getTelegramConfig();
  }

  private save(config: TelegramConfig | null) {
    this.options.store.saveTelegramConfig(config);
  }

  /** The messenger Think should run, if a bot is connected. */
  messengers(): ThinkMessengers {
    const config = this.config;
    if (!config) return {};
    return {
      telegram: telegramMessenger({
        token: config.token,
        userName: config.botUsername,
        secretToken: config.webhookSecret,
        apiBaseUrl: this.options.env.TELEGRAM_API_BASE_URL || undefined,
        conversation: "self",
        respondTo: ["direct-message"]
      })
    };
  }

  status(): TelegramStatus {
    return toTelegramStatus(this.config);
  }

  /**
   * Connects a bot by its @BotFather token. `origin` is the app's public
   * origin; Telegram only delivers to https://, so on local http dev the bot
   * is saved but its webhook has to be pointed at a tunnel by hand.
   */
  async connect(token: string, origin: string | null) {
    const { env } = this.options;
    token = token.trim();
    if (!/^\d+:[\w-]{20,}$/.test(token)) {
      throw new Error("That doesn't look like a bot token from @BotFather.");
    }
    const bot = (await callTelegram(env, token, "getMe", {})) as {
      username?: string;
    };
    if (!bot.username) throw new Error("Telegram did not return the bot.");

    const previous = this.config;
    const config: TelegramConfig = {
      token,
      botUsername: bot.username,
      webhookSecret: randomHex(),
      routeId: randomHex(),
      webhookSet: false,
      ownerId: null,
      ...newClaim()
    };

    if (origin?.startsWith("https://")) {
      await callTelegram(env, token, "setWebhook", {
        url: `${origin}${webhookPath(config.routeId)}`,
        secret_token: config.webhookSecret,
        allowed_updates: ["message", "edited_message", "callback_query"]
      });
      config.webhookSet = true;
    }

    await routes(env).set(config.routeId, this.options.userId());
    if (previous && previous.token !== token) {
      await callTelegram(env, previous.token, "deleteWebhook", {}).catch(
        (error: unknown) => console.error(error)
      );
    }
    this.save(config);
    this.options.onBotChanged();
    return toTelegramStatus(config);
  }

  newClaimLink() {
    const config = this.config;
    if (!config) throw new Error("Connect a bot first.");
    const next = { ...config, ownerId: null, ...newClaim() };
    this.save(next);
    return toTelegramStatus(next);
  }

  async disconnect() {
    const { env } = this.options;
    const config = this.config;
    if (!config) return toTelegramStatus(null);
    await callTelegram(env, config.token, "deleteWebhook", {}).catch(
      (error: unknown) => console.error(error)
    );
    await routes(env).remove(this.options.userId());
    this.save(null);
    this.options.onBotChanged();
    return toTelegramStatus(null);
  }

  /**
   * Decides what happens to a webhook update. Returns "forward" when the
   * owner sent it and Think's messenger runtime should answer.
   */
  async receive(secret: string, body: string): Promise<TelegramUpdateResult> {
    const { env } = this.options;
    const config = this.config;
    if (!config) return "unauthorized";
    const decision = gateUpdate(config, secret, body);
    switch (decision.kind) {
      case "unauthorized":
        return "unauthorized";
      case "ignore":
        return "handled";
      case "claim":
        this.save({ ...config, ownerId: decision.ownerId, claimCode: null });
        await sendText(
          env,
          config.token,
          decision.chatId,
          "Connected ✓ This bot now talks to your assistant — same conversation, memory and reminders as the web app."
        );
        return "handled";
      case "reject":
        await sendText(
          env,
          config.token,
          decision.chatId,
          "This is a private assistant."
        );
        return "handled";
      case "forward":
        // Removing the owner from ALLOWED_EMAILS also cuts off Telegram.
        return this.options.ownerAllowed() ? "forward" : "handled";
    }
  }

  /** Messages the owner of the connected bot, if any, outside the chat. */
  async notify(text: string) {
    const config = this.config;
    if (!config?.ownerId) return;
    await sendText(this.options.env, config.token, config.ownerId, text);
  }
}
