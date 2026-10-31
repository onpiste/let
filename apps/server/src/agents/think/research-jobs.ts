import type { Agent } from "agents";
import type { UIMessage } from "ai";

import type { Settings } from "@cot/shared";

import { researchState, startResearch } from "../../tools/deep-research";

/** The assistant, as far as research jobs need it. */
export type ResearchHost = Agent<Env> & {
  /** The schedule callback that polls a job. */
  checkResearch(id: string): Promise<void>;
  addMessages(messages: UIMessage[]): Promise<void>;
};

type JobRow = { id: string; topic: string; started_at: number };

const POLL_SECONDS = 30;
/** Deep Research takes minutes; give up on one that runs past this. */
const MAX_RUN_MS = 60 * 60 * 1000;
/** Each run is billed to the user's key, so cap how many go at once. */
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
    private readonly store: { getSettings(): Settings },
    private readonly onFinished: (topic: string, ok: boolean) => Promise<void>
  ) {}

  /** The user's Google key; without one there is no web search or research. */
  apiKey() {
    return this.store.getSettings().apiKeys.google;
  }

  private ensureTables() {
    this.host.sql`CREATE TABLE IF NOT EXISTS research_jobs (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      started_at INTEGER NOT NULL
    )`;
  }

  async start(topic: string) {
    this.ensureTables();
    const key = this.apiKey();
    if (!key) return "Deep research needs a Google API key in Settings.";
    const [running] = this.host.sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM research_jobs`;
    if ((running?.n ?? 0) >= MAX_RUNNING) {
      return `${MAX_RUNNING} research runs are already going. Wait for one to finish.`;
    }
    const id = await startResearch(this.env, key, topic);
    this.host.sql`INSERT INTO research_jobs (id, topic, started_at)
      VALUES (${id}, ${topic}, ${Date.now()})`;
    await this.host.schedule(POLL_SECONDS, "checkResearch", id);
    return "Deep research started. It usually takes several minutes; the report will be added to this chat and the user notified when it's ready. Tell the user that, briefly, and don't wait for it.";
  }

  async check(id: string) {
    this.ensureTables();
    const [job] = this.host.sql<JobRow>`
      SELECT id, topic, started_at FROM research_jobs WHERE id = ${id}`;
    if (!job) return;
    const key = this.apiKey();
    if (!key) return this.finish(job, "the Google API key was removed", false);
    try {
      const state = await researchState(key, id);
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
