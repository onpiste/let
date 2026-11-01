import type { Agent } from "agents";
import type { UIMessage } from "ai";

import type { Settings } from "@cot/shared";

import { researchState, startResearch } from "../../tools/deep-research";
import { geminiKey, type GeminiKey } from "../../tools/gemini";
import {
  countWebUse,
  webUseRefusal,
  type WebUsageStore
} from "../common/web-usage";

/** The assistant, as far as research jobs need it. */
export type ResearchHost = Agent<Env> & {
  /** The schedule callback that polls a job. */
  checkResearch(id: string): Promise<void>;
  addMessages(messages: UIMessage[]): Promise<void>;
};

type JobRow = {
  id: string;
  topic: string;
  started_at: number;
  /** 1 when the run is on the user's own key, 0 on the deployment's. */
  own_key: number;
};

const POLL_SECONDS = 30;
/** Deep Research takes minutes; give up on one that runs past this. */
const MAX_RUN_MS = 60 * 60 * 1000;
/** Each run is billed, so cap how many go at once. */
const MAX_RUNNING = 3;

/**
 * Gemini Deep Research runs, tracked in the assistant's SQLite. A run lives
 * on Google's side; the assistant polls it on a schedule (a Worker can't wait
 * minutes inside one turn) and, when it ends, adds the report to the chat as
 * an assistant message without starting a model turn.
 */
export class ResearchJobs {
  constructor(
    private readonly host: ResearchHost,
    private readonly env: Env,
    private readonly store: { getSettings(): Settings } & WebUsageStore,
    private readonly onFinished: (topic: string, ok: boolean) => Promise<void>
  ) {}

  /** The Gemini key to use now; null leaves out web search and research. */
  key() {
    return geminiKey(this.env, this.store.getSettings().apiKeys.google);
  }

  /**
   * Throws when the account is out of today's shared Gemini access; the
   * user's own key is free and never limited.
   */
  allow(use: "search" | "research", key: GeminiKey) {
    const refusal = key.ownKey
      ? null
      : webUseRefusal(this.env, this.store, use);
    if (refusal) throw new Error(refusal);
  }

  /** Counts a use Google accepted against the deployment's key. */
  count(use: "search" | "research", key: GeminiKey) {
    if (!key.ownKey) countWebUse(this.store, use);
  }

  private ensureTables() {
    this.host.sql`CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      own_key INTEGER NOT NULL
    )`;
  }

  /**
   * Starts a run. Throws when it can't, so the tool call ends as an error
   * and the chat shows it failed rather than started.
   */
  async start(topic: string) {
    this.ensureTables();
    const key = this.key();
    if (!key) throw new Error("Deep research isn't set up on this deployment.");
    const [running] = this.host.sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM research_jobs`;
    if ((running?.n ?? 0) >= MAX_RUNNING) {
      throw new Error(
        `${MAX_RUNNING} research runs are already going. Wait for one to finish.`
      );
    }
    this.allow("research", key);
    const id = await startResearch(this.env, key, topic);
    this.count("research", key);
    this.host.sql`INSERT INTO research_jobs (id, topic, started_at, own_key)
      VALUES (${id}, ${topic}, ${Date.now()}, ${key.ownKey ? 1 : 0})`;
    await this.host.schedule(POLL_SECONDS, "checkResearch", id);
    return "Deep research started. It usually takes several minutes; the report will be added to this chat and the user notified when it's ready. Tell the user that, briefly, and don't wait for it.";
  }

  async check(id: string) {
    this.ensureTables();
    const [job] = this.host.sql<JobRow>`
      SELECT id, topic, started_at, own_key FROM research_jobs
      WHERE id = ${id}`;
    if (!job) return;
    // A run belongs to the key that started it, so poll with that one.
    const key = this.key();
    if (!key || key.ownKey !== Boolean(job.own_key)) {
      return this.finish(job, "the Google API key changed", false);
    }
    try {
      const state = await researchState(this.env, key, id);
      if (state.status === "done") return this.finish(job, state.report, true);
      if (state.status === "failed") {
        return this.finish(job, state.error, false);
      }
    } catch (error) {
      // A failed poll is retried on the next one until the run times out.
      console.error(`Research poll failed: ${String(error)}`);
    }
    if (Date.now() - job.started_at > MAX_RUN_MS) {
      return this.finish(job, "it ran for over an hour", false);
    }
    await this.host.schedule(POLL_SECONDS, "checkResearch", id);
  }

  private async finish(job: JobRow, body: string, ok: boolean) {
    this.host.sql`DELETE FROM research_jobs WHERE id = ${job.id}`;
    const text = ok
      ? `**Deep research: ${job.topic}**\n\n${body}`
      : `Deep research on "${job.topic}" failed: ${body}`;
    await this.host.addMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text }],
        metadata: { createdAt: Date.now() }
      }
    ]);
    await this.onFinished(job.topic, ok);
  }
}
