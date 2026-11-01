import { Think, type TurnConfig, type TurnContext } from "@cloudflare/think";
import type { LanguageModel, ToolSet, UIMessage } from "ai";

import { DEFAULT_SETTINGS } from "@cot/shared";

import { cannedReply } from "./canned-reply";
import type { ChatServices, TurnSetup } from "./chat-services";
import { stampCreatedAt } from "./history";
import { modelFor } from "./model";
import { assistantTools, localTools, NEEDS_APPROVAL } from "./tools";
import { mcpTools } from "./tools/mcp";

/**
 * One conversation. Each chat is its own agent, a facet of the user's
 * `Assistant` with its own SQLite, so turns in different chats run side by
 * side and a reply keeps going (and recovers after a restart) while the
 * client shows another chat. Think runs the loop and stores the messages.
 *
 * The user's state stays in the assistant: before each turn the chat fetches
 * its settings, prompt and MCP tools (`ChatServices.turn`), its tools call
 * back for memory, reminders, saved chats, Gemini and the inbox, and after
 * each turn it reports its messages for the history list and search.
 *
 * Only reachable through the signed-in owner's assistant (http/router.ts and
 * `Assistant.onBeforeSubAgent`).
 */
export class Chat extends Think<Env> {
  /** The latest turn's setup; tools read settings from it at call time. */
  private setup: TurnSetup | null = null;

  /** Whether the turn in progress came from Telegram. */
  private messengerTurn = false;

  /** The owning assistant's name (`google:<sub>`). */
  private get ownerName() {
    const owner = this.parentPath[0];
    if (!owner) throw new Error("A chat runs under an assistant.");
    return owner.name;
  }

  private get services(): ChatServices {
    const owner = this.env.Assistant.getByName(this.ownerName);
    // The RPC stub of an RpcTarget behaves like the class itself; TS can't
    // map its recursive JSON types through Rpc.Stub, so it is typed as one.
    return (
      owner as unknown as { chatServices(id: string): ChatServices }
    ).chatServices(this.name);
  }

  /**
   * The services for tools, which run later in the turn: each call takes a
   * fresh stub, so none depends on one an earlier call may have released.
   */
  private get toolServices(): ChatServices {
    // Every property the tools read is a ChatServices method.
    return new Proxy({} as ChatServices, {
      get:
        (_, method: keyof ChatServices) =>
        (...args: unknown[]) =>
          (this.services[method] as (...a: unknown[]) => unknown)(...args)
    });
  }

  private get settings() {
    return this.setup?.settings ?? DEFAULT_SETTINGS;
  }

  override messageMetadata = stampCreatedAt;

  override getModel(): string | LanguageModel {
    return modelFor(this.settings);
  }

  override getSystemPrompt() {
    return this.setup?.instructions ?? "";
  }

  // The sandbox is per user, shared by every chat.
  override getTools(): ToolSet {
    return localTools({
      env: this.env,
      sandbox: this.env.SANDBOX.getByName(this.ownerName),
      approvalMode: () => this.settings.approvalMode
    });
  }

  override async beforeTurn(ctx: TurnContext): Promise<TurnConfig | void> {
    // Continuations and recoveries finish a turn that was already counted.
    const newTurn =
      ctx.trigger !== undefined &&
      !ctx.continuation &&
      !ctx.trigger.startsWith("recovery");
    this.messengerTurn = Boolean(ctx.messenger);
    const setup = await this.services.turn(newTurn, Boolean(ctx.messenger));
    this.setup = setup;
    if (setup.refusal) {
      return { model: cannedReply(setup.refusal), activeTools: [] };
    }
    const services = this.toolServices;
    const tools = {
      ...assistantTools(services, setup),
      ...mcpTools(services, setup.mcp)
    };
    // Telegram has no approval buttons, so those tools are withheld there.
    const activeTools = ctx.messenger
      ? [...Object.keys(ctx.tools), ...Object.keys(tools)].filter(
          (name) => !NEEDS_APPROVAL.has(name)
        )
      : undefined;
    return {
      model: modelFor(setup.settings),
      instructions: setup.instructions,
      tools,
      activeTools
    };
  }

  override async onChatResponse() {
    await this.report(true);
  }

  /**
   * Think's messenger delivery posts nothing when a turn fails (it only
   * apologizes for failures on its own side), so a Telegram message would
   * get no answer at all. Tell the owner there, with the reason.
   */
  override onChatError(error: unknown) {
    console.error("Chat turn failed", error);
    if (this.messengerTurn) void this.tellMessenger(error);
    return error;
  }

  private async tellMessenger(error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await this.services.messengerFailed(
        `Sorry, I couldn't answer that: ${reason}`
      );
    } catch (notifyError) {
      console.error(notifyError);
    }
  }

  private async report(turnEnded: boolean) {
    await this.services.saved(await this.getMessages(), turnEnded);
  }

  // ── RPC from the assistant ──────────────────────────────────────────

  /** Loads a conversation saved before chats were separate agents. */
  async importMessages(messages: UIMessage[]) {
    await this.clearMessages();
    await this.addMessages(messages);
  }

  /** Adds a message (a Deep Research report) without starting a turn. */
  async addReport(message: UIMessage) {
    await this.addMessages([message]);
    await this.report(false);
  }
}
