import type { ErrorGroup } from "@cot/shared";

import { commitUrl } from "./github";

/**
 * How a production error reads as a GitHub issue, and the state hidden in
 * its body. Only `publicSample` data goes in: these issues may be public.
 */

/** What the watcher remembers about a problem between runs. */
export type State = {
  fp: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  users: number;
  versions: string[];
};

const MARKER = /<!-- cot-error (\{.*?\}) -->/;

export function readState(body: string): State | null {
  const json = MARKER.exec(body)?.[1];
  if (!json) return null;
  try {
    // Trust boundary: written by `issueBody` below; checked before use.
    const state = JSON.parse(json) as Record<string, unknown>;
    if (typeof state.fp !== "string" || typeof state.lastSeen !== "string") {
      return null;
    }
    return {
      fp: state.fp,
      count: Number(state.count) || 0,
      firstSeen:
        typeof state.firstSeen === "string" ? state.firstSeen : state.lastSeen,
      lastSeen: state.lastSeen,
      users: Number(state.users) || 0,
      versions: Array.isArray(state.versions) ? state.versions.map(String) : []
    };
  } catch {
    return null;
  }
}

export function issueTitle(group: ErrorGroup) {
  return `[${group.source}/${group.scope}] ${group.title}`.slice(0, 200);
}

/** Ids that are safe to paste into a shell command, unquoted. */
const SAFE_ID = /^[\w.:-]{1,120}$/;

/** Versions shown in the body; client lines may send any text here. */
const SAFE_VERSION = /^[\w.+-]{1,64}$/;

/** The versions safe to show in Markdown, in order. */
export function shownVersions(versions: string[]) {
  return versions.filter((version) => SAFE_VERSION.test(version));
}

/** State as JSON that cannot close the HTML comment it is hidden in. */
function stateMarker(state: State) {
  const json = JSON.stringify(state)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `<!-- cot-error ${json} -->`;
}

function versionLink(version: string) {
  return /^[0-9a-f]{7,40}$/.test(version)
    ? `[\`${version}\`](${commitUrl(version)})`
    : `\`${version}\``;
}

/** `latest` supplies the sample; the counts come from `state`. */
export function issueBody(state: State, latest: ErrorGroup) {
  const { sample } = latest;
  const candidate = sample.requestId ?? sample.session;
  const follow = candidate && SAFE_ID.test(candidate) ? candidate : null;
  const shown = shownVersions(state.versions);
  const versions =
    shown.length > 0 ? shown.map(versionLink).join(", ") : "unknown";
  return [
    stateMarker(state),
    `A production error from the \`${latest.source}\` logs, scope \`${latest.scope}\`.`,
    "",
    "| | |",
    "| --- | --- |",
    `| Occurrences | ${state.count} |`,
    `| Accounts affected | ${state.users || "unknown"} |`,
    `| First seen | ${state.firstSeen} |`,
    `| Last seen | ${state.lastSeen} |`,
    `| Versions | ${versions} |`,
    `| Fingerprint | \`${state.fp}\` |`,
    "",
    "### Latest occurrence",
    "",
    "```json",
    JSON.stringify(sample, null, 2),
    "```",
    "",
    "### Fix it",
    "",
    "Follow the release-loop skill (`.agents/skills/release-loop/SKILL.md`):",
    "",
    "```sh",
    ...(follow ? [`bun run logs --since 1d --grep ${follow}`] : []),
    "bun run errors --since 1d   # is it still happening, and how often",
    "```",
    "",
    "Reproduce it in a test, fix it (reference this issue with `Refs #…`),",
    "and close it once the fix is verified live. If the error returns after that, this issue reopens as a",
    "`regression`. Close it as *not planned* to mute this error for good.",
    "",
    "_Counts are updated in place by the Watch workflow._"
  ].join("\n");
}
