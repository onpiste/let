import type { Agent } from "agents";
import type { UIMessage } from "ai";

import type { ResearchJob, ServerEvent, Settings } from "@cot/shared";

import { researchState, startResearch } from "../../tools/deep-research";
import { geminiKey, type GeminiKey } from "../../tools/gemini";
import { followResearch } from "../../tools/research-stream";
import {
  countWebUse,
  webUseRefusal,
  type WebUsageStore
} from "../common/web-usage";

/** The assistant, as far as research jobs need it. */
export type ResearchHost = Agent<Env> & {
  /** The schedule callback that polls a job. */
  checkResearch(id: string): Promise<void>;
  /** Adds a message to a chat (null: the one in use) without a turn. */
  postToChat(chatId: string | null, message: UIMessage): Promise<void>;
};

type JobRow = {
  id: string;
  topic: string;
  started_at: number;
  /** 1 when the run is on the user's own key, 0 on the deployment's. */
  own_key: number;
  progress: string | null;
  problem: string | null;
  /** Polls that failed in a row. */
  failures: number;
  /** The chat the report goes to; null for runs started before chats split. */
  chat_id: string | null;
};

const POLL_SECONDS = 30;
/**
 * How long one check follows the run's stream for thoughts. The schedule
 * runs in the alarm, so keep it short enough not to hold up reminders.
 */
const FOLLOW_MS = 60 * 1000;
/** Clients get at most one progress update this often. */
const PROGRESS_MS = 2000;
/** Deep Research takes minutes; give up on one that runs past this. */
const MAX_RUN_MS = 60 * 60 * 1000;
/** Each run is billed, so cap how many go at once. */
const MAX_RUNNING = 3;
/** Polls that may fail in a row (5 minutes) before the run is given up. */
const MAX_FAILURES = 10;

/**
 * Gemini Deep Research runs, tracked in the assistant's SQLite. A run lives
 * on Google's side; the assistant polls it on a schedule (a Worker can't wait
 * minutes inside one turn) and, when it ends, adds the report to the chat
 * that started it as an assistant message, without starting a model turn.
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
      own_key INTEGER NOT NULL,
      progress TEXT,
      problem TEXT,
      failures INTEGER NOT NULL DEFAULT 0
    )`;
    // Tables created before progress was tracked lack these columns.
    const columns = this.host.sql<{ name: string }>`
      SELECT name FROM pragma_table_info('research_jobs')`;
    if (!columns.some((column) => column.name === "failures")) {
      this.host.sql`ALTER TABLE research_jobs ADD COLUMN progress TEXT`;
      this.host.sql`ALTER TABLE research_jobs ADD COLUMN problem TEXT`;
      this.host.sql`ALTER TABLE research_jobs
        ADD COLUMN failures INTEGER NOT NULL DEFAULT 0`;
    }
    if (!columns.some((column) => column.name === "chat_id")) {
      this.host.sql`ALTER TABLE research_jobs ADD COLUMN chat_id TEXT`;
    }
  }

  /** The runs still going, oldest first, for the chat's progress strip. */
  list(): ResearchJob[] {
    this.ensureTables();
    return this.host.sql<JobRow>`
      SELECT * FROM research_jobs ORDER BY started_at`.map((job) => ({
      id: job.id,
      topic: job.topic,
      startedAt: job.started_at,
      progress: job.progress,
      problem: job.problem
    }));
  }

  /** Tells open clients the runs changed, so they can show progress. */
  private broadcast() {
    const event: ServerEvent = { type: "research-jobs", jobs: this.list() };
    this.host.broadcast(JSON.stringify(event));
  }

  /**
   * Starts a run. Throws when it can't, so the tool call ends as an error
   * and the chat shows it failed rather than started.
   */
  async start(topic: string, chatId: string) {
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
    this.host.sql`INSERT INTO research_jobs
      (id, topic, started_at, own_key, chat_id)
      VALUES (${id}, ${topic}, ${Date.now()}, ${key.ownKey ? 1 : 0}, ${chatId})`;
    // Start following soon, so the first thoughts show without a long wait.
    await this.host.schedule(5, "checkResearch", id);
    this.broadcast();
    return "Deep research started. It usually takes several minutes; the report will be added to this chat and the user notified when it's ready. Tell the user that, briefly, and don't wait for it.";
  }

  async check(id: string) {
    this.ensureTables();
    const [job] = this.host.sql<JobRow>`
      SELECT * FROM research_jobs WHERE id = ${id}`;
    if (!job) return;
    // A run belongs to the key that started it, so poll with that one.
    const key = this.key();
    if (!key || key.ownKey !== Boolean(job.own_key)) {
      return this.finish(job, "the Google API key changed", false);
    }
    // Follow the stream again at once if it was cut off only by the window;
    // a stream that closed by itself waits for the next poll.
    let delay = POLL_SECONDS;
    try {
      const ended = await this.follow(id, key);
      if (!ended) delay = 1;
      const state = await researchState(this.env, key, id);
      if (state.status === "done") return this.finish(job, state.report, true);
      if (state.status === "failed") {
        return this.finish(job, state.error, false);
      }
      this.host.sql`UPDATE research_jobs
        SET problem = NULL, failures = 0 WHERE id = ${id}`;
    } catch (error) {
      // A failed poll is retried, but not for the whole hour: a bad key or a
      // gateway that keeps failing would otherwise look like a stuck run.
      delay = POLL_SECONDS;
      const problem = String(error).slice(0, 300);
      console.error(`Research ${id} poll failed: ${problem}`);
      if (job.failures + 1 >= MAX_FAILURES) {
        return this.finish(
          job,
          `checking on it kept failing (${problem})`,
          false
        );
      }
      this.host.sql`UPDATE research_jobs
        SET problem = ${problem}, failures = failures + 1
        WHERE id = ${id}`;
    }
    if (Date.now() - job.started_at > MAX_RUN_MS) {
      return this.finish(job, "it ran for over an hour", false);
    }
    this.broadcast();
    await this.host.schedule(delay, "checkResearch", id);
  }

  /**
   * Follows the run's thoughts for a while, saving and broadcasting each new
   * one. The stream replays earlier thoughts first, so updates are throttled.
   */
  private async follow(id: string, key: GeminiKey) {
    let latest: string | null = null;
    let sentAt = 0;
    const save = () => {
      this.host.sql`UPDATE research_jobs SET progress = ${latest}
        WHERE id = ${id}`;
      this.broadcast();
      sentAt = Date.now();
    };
    const ended = await followResearch(this.env, key, id, FOLLOW_MS, (gist) => {
      if (gist === latest) return;
      latest = gist;
      if (Date.now() - sentAt >= PROGRESS_MS) save();
    });
    if (latest !== null) save();
    return ended;
  }

  private async finish(job: JobRow, body: string, ok: boolean) {
    this.host.sql`DELETE FROM research_jobs WHERE id = ${job.id}`;
    if (!ok) console.warn(`Research ${job.id} failed: ${body.slice(0, 300)}`);
    this.broadcast();
    const text = ok
      ? `**Deep research: ${job.topic}**\n\n${body}`
      : `Deep research on "${job.topic}" failed: ${body}`;
    await this.host.postToChat(job.chat_id, {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "text", text }],
      metadata: { createdAt: Date.now() }
    });
    await this.onFinished(job.topic, ok);
  }
}
