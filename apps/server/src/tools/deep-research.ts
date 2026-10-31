import { gemini, type GeminiKey } from "./gemini";

/** The parts of an Interactions API resource that Cot reads. */
type Interaction = {
  id: string;
  status: string;
  steps?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string; title?: string }[];
    }[];
  }[];
  errors?: { message?: string }[];
};

export type ResearchState =
  | { status: "running" }
  | { status: "done"; report: string }
  | { status: "failed"; error: string };

/**
 * Starts a Gemini Deep Research run in the background and returns its id.
 * The agent plans, searches and reads on Google's side for several minutes;
 * poll it with `researchState`.
 */
export async function startResearch(env: Env, key: GeminiKey, topic: string) {
  const interaction = await gemini<Interaction>(env, key, "interactions", {
    agent: env.GEMINI_RESEARCH_AGENT,
    input: topic,
    background: true
  });
  return interaction.id;
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
      return { status: "running" };
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
