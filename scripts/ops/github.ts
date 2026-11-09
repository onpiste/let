/**
 * The few GitHub REST calls the release loop needs, with the token GitHub
 * Actions provides (GITHUB_TOKEN, `issues: write`). No dependency, so the
 * workflows stay fast.
 */

const api = process.env.GITHUB_API_URL || "https://api.github.com";
const repo = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const server = process.env.GITHUB_SERVER_URL || "https://github.com";

export const githubReady = repo !== "" && token !== "";

export type Issue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  /** "not_planned" mutes a production error (see issues.ts). */
  state_reason: string | null;
  closed_at: string | null;
  html_url: string;
  /** Set on pull requests, which the issues API also lists. */
  pull_request?: unknown;
};

type IssuePatch = {
  title?: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
};

async function call<T>(method: string, path: string, body?: unknown) {
  const response = await fetch(`${api}/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cot-release-loop",
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    throw new Error(
      `GitHub ${method} ${path}: ${response.status} ${await response.text()}`
    );
  }
  // Trust boundary: GitHub's documented response for each call below.
  return (await response.json()) as T;
}

/**
 * Every issue with `label`, open and closed, newest first. Stops at 50
 * pages (5,000 issues) only so a bad response can't page forever.
 */
export async function listIssues(label: string, page = 1): Promise<Issue[]> {
  const batch = await call<Issue[]>(
    "GET",
    `/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`
  );
  const issues = batch.filter((issue) => !issue.pull_request);
  if (batch.length < 100 || page >= 50) return issues;
  return [...issues, ...(await listIssues(label, page + 1))];
}

/**
 * Runs writes one after another: GitHub asks for that when creating
 * content, and the order of issues and comments then matches the plan.
 */
export function inOrder(tasks: (() => Promise<void>)[]) {
  return tasks.reduce((done, task) => done.then(task), Promise.resolve());
}

export function createIssue(title: string, body: string, labels: string[]) {
  return call<Issue>("POST", "/issues", { title, body, labels });
}

export function updateIssue(number: number, patch: IssuePatch) {
  return call<Issue>("PATCH", `/issues/${number}`, patch);
}

export function commentOnIssue(number: number, body: string) {
  return call<unknown>("POST", `/issues/${number}/comments`, { body });
}

export function commitUrl(sha: string) {
  return `${server}/${repo}/commit/${sha}`;
}

/** The workflow run this script is part of, or "" outside Actions. */
export function runUrl() {
  const id = process.env.GITHUB_RUN_ID;
  return id ? `${server}/${repo}/actions/runs/${id}` : "";
}
