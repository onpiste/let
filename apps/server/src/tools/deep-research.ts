import { gemini, type GeminiKey } from "./gemini";

/** The parts of an Interactions API resource that Cot reads. */
type Interaction = {
  id: string;
  status: string;
  steps?: {
    type?: string;
    text?: string;
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string; title?: string }[];
    }[];
  }[];
  errors?: { message?: string }[];
};

export type ResearchState =
  /** `progress` is Gemini's latest thought summary, when the poll has one. */
  | { status: "running"; progress: string | null }
  | { status: "done"; report: string }
  | { status: "failed"; error: string };

/**
 * Starts a Gemini Deep Research run in the background and returns its id.
 * The agent plans, searches and reads on Google's side for several minutes;
 * poll it with `researchState`.
 */
export async function startResearch(env: Env, key: GeminiKey, topic: string) {
  const request = {
    agent: env.GEMINI_RESEARCH_AGENT,
    input: topic,
    background: true
  };
  // Thought summaries are off by default; with them a run may show what it
  // is working on. They are optional, so an agent that rejects the setting
  // still gets the run.
  const withSummaries = {
    ...request,
    agent_config: { type: "deep-research", thinking_summaries: "auto" }
  };
  try {
    return (await gemini<Interaction>(env, key, "interactions", withSummaries))
      .id;
  } catch (error) {
    if (!String(error).includes("Gemini API 400")) throw error;
    return (await gemini<Interaction>(env, key, "interactions", request)).id;
  }
}

export async function researchState(
  env: Env,
  key: GeminiKey,
  id: string
): Promise<ResearchState> {
  const interaction = await gemini<Interaction>(
    env,
    key,
    `interactions/${encodeURIComponent(id)}`
  );
  switch (interaction.status) {
    case "in_progress":
      return { status: "running", progress: latestThought(interaction) };
    case "completed":
      return { status: "done", report: reportOf(interaction) };
    default:
      return {
        status: "failed",
        error:
          interaction.errors?.map((e) => e.message).join("; ") ||
          `The research ended as ${interaction.status}.`
      };
  }
}

/**
 * The newest thought summary. Google documents these for streamed runs;
 * a poll may or may not carry them, so this is best effort.
 */
function latestThought(interaction: Interaction) {
  const thoughts = (interaction.steps ?? []).filter(
    (s) => s.type === "thought"
  );
  const thought = thoughts[thoughts.length - 1];
  const text =
    thought?.content?.find((c) => c.text)?.text ?? thought?.text ?? "";
  // A summary often opens with a bold title; that line is the gist.
  const gist = text.trim().split("\n")[0]?.replace(/\*\*/g, "").trim();
  return gist ? gist.slice(0, 160) : null;
}

/** The final model output, with its cited pages listed at the end. */
function reportOf(interaction: Interaction) {
  const outputs = (interaction.steps ?? []).filter(
    (s) => s.type === "model_output"
  );
  const parts = (outputs.at(-1)?.content ?? []).filter(
    (c) => c.type === "text"
  );
  const text = parts.map((c) => c.text ?? "").join("\n\n");
  const cited = new Map<string, string>();
  for (const a of parts.flatMap((c) => c.annotations ?? [])) {
    if (a.type === "url_citation" && a.url) cited.set(a.url, a.title ?? a.url);
  }
  // Reports often list their sources already; only add the ones they don't.
  const sources = [...cited]
    .filter(([url]) => !text.includes(url))
    .map(([url, title]) => `- [${title}](${url})`);
  return sources.length
    ? `${text}\n\n**Sources**\n\n${sources.join("\n")}`
    : text || "The research finished without a report.";
}
