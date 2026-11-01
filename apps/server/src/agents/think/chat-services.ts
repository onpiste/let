import type { MCPClientManager } from "agents/mcp/client";
import type { UIMessage } from "ai";
import { RpcTarget } from "cloudflare:workers";

import type { Settings, Skill, TaskSchedule } from "@cot/shared";

import type { Inbox } from "../../integrations/email/inbox";
import { searchWeb } from "../../tools/web-search";
import { setReminder, type ReminderAgent } from "../common/reminders";
import { countTurn } from "../common/usage";
import type { ChatHistory } from "./history";
import { paidByUser } from "./model";
import type { ResearchJobs } from "./research-jobs";
import type { AssistantStore } from "./store";
import { buildSystemPrompt } from "./system-prompt";
import { Tasks } from "./tasks";
import type { AssistantServices } from "./tools";
import type { Json, McpToolInfo } from "./tools/mcp";

/** Everything a chat needs from the assistant to run one turn. */
export type TurnSetup = {
  settings: Settings;
  instructions: string;
  /** Set when the turn is over a usage limit; shown instead of a reply. */
  refusal: string | null;
  skills: Skill[];
  webSearch: boolean;
  email: boolean;
  mcp: McpToolInfo[];
};

/** How long a turn waits for MCP servers that are still connecting. */
const MCP_WAIT_MS = 5000;

/** The parts of the assistant that its chats use. */
export type ChatServicesHost = {
  env: Env;
  agent: ReminderAgent;
  store: AssistantStore;
  history: ChatHistory;
  research: ResearchJobs;
  inbox: Inbox | null;
  emailAddress: string | null;
  mcp: MCPClientManager;
};

/**
 * What the assistant does for one of its chats. The chats are separate
 * agents (chat.ts) with their own storage, while memory, settings, reminders,
 * the inbox, MCP connections and usage limits are the user's and live in the
 * assistant; a chat gets this object over Durable Object RPC (never from a
 * browser: it is not a callable) and its tools call back through it.
 */
export class ChatServices extends RpcTarget implements AssistantServices {
  constructor(
    private readonly chatId: string,
    private readonly host: ChatServicesHost
  ) {
    super();
  }

  /** Called before every turn; `newTurn` is false for continuations. */
  async turn(newTurn: boolean, messenger: boolean): Promise<TurnSetup> {
    const { store, history, research, env, mcp } = this.host;
    store.ensureTables();
    const settings = store.getSettings();
    const refusal = newTurn
      ? countTurn(store, env, paidByUser(settings))
      : null;
    if (newTurn) history.setActive(this.chatId);
    history.setRunning(this.chatId, true);
    const skills = store.listSkills();
    const webSearch = research.key() !== null;
    await mcp.waitForConnections({ timeout: MCP_WAIT_MS });
    return {
      settings,
      refusal,
      instructions: buildSystemPrompt({
        settings,
        memories: store.listMemories(),
        commandsAllowed: !messenger,
        emailAddress: this.host.emailAddress,
        skills,
        webSearch
      }),
      skills,
      webSearch,
      email: this.host.inbox !== null,
      mcp: mcp.listTools().map((tool) => ({
        serverId: tool.serverId,
        name: tool.name,
        description: tool.description ?? null,
        // Plain JSON Schema from the MCP server.
        inputSchema: (tool.inputSchema as Json | undefined) ?? {
          type: "object"
        }
      }))
    };
  }

  /** The chat's messages after a turn ended (or a report was added). */
  async saved(messages: UIMessage[], turnEnded: boolean) {
    const { history, env } = this.host;
    history.record(this.chatId, messages, turnEnded ? false : null);
    await history.autoTitle(env.AI, this.chatId, messages);
  }

  // ── Memory ──────────────────────────────────────────────────────────

  async addMemory(content: string) {
    this.host.store.addMemory(content);
  }

  async removeMemory(id: number) {
    this.host.store.removeMemory(id);
  }

  // ── Earlier chats ───────────────────────────────────────────────────

  async searchChats(query: string) {
    return this.host.history.search(query, this.chatId);
  }

  async readChat(id: string, seq: number) {
    return this.host.history.read(id, seq);
  }

  // ── Reminders ───────────────────────────────────────────────────────

  async setReminder(when: Date | string | number, description: string) {
    return setReminder(this.host.agent, this.host.env, when, description);
  }

  private get tasks() {
    return new Tasks(this.host.agent);
  }

  async listTasks() {
    return this.tasks.list();
  }

  async updateTask(
    id: string,
    change: { description?: string; schedule?: TaskSchedule }
  ) {
    return this.tasks.update(id, change);
  }

  async pauseTask(id: string) {
    return this.tasks.pause(id);
  }

  async resumeTask(id: string) {
    return this.tasks.resume(id);
  }

  async deleteTask(id: string) {
    return this.tasks.remove(id);
  }

  // ── Gemini ──────────────────────────────────────────────────────────

  async searchWeb(query: string) {
    const { research, env } = this.host;
    const key = research.key();
    if (!key) throw new Error("Web search isn't set up on this deployment.");
    research.allow("search", key);
    const answer = await searchWeb(env, key, query);
    research.count("search", key);
    return answer;
  }

  async deepResearch(topic: string) {
    return this.host.research.start(topic, this.chatId);
  }

  // ── Inbox ───────────────────────────────────────────────────────────

  private get inbox() {
    if (!this.host.inbox) throw new Error("There is no inbox.");
    return this.host.inbox;
  }

  async listEmails(limit: number, offset: number) {
    return this.inbox.list(limit, offset);
  }

  async searchEmails(query: string, limit: number) {
    return this.inbox.search(query, limit);
  }

  async readEmail(id: number) {
    return this.inbox.get(id);
  }

  // ── MCP ─────────────────────────────────────────────────────────────

  async callMcp(serverId: string, name: string, args: Record<string, Json>) {
    const result = await this.host.mcp.callTool({
      serverId,
      name,
      arguments: args
    });
    if (result.isError) {
      const first = Array.isArray(result.content) ? result.content[0] : null;
      throw new Error(
        first?.type === "text" && first.text ? first.text : "Tool call failed"
      );
    }
    // Plain JSON from the MCP server, cloned so it crosses RPC as data.
    return JSON.parse(JSON.stringify(result)) as Json;
  }
}
