import { execSync } from "node:child_process";

import { parseFlags } from "../devlog/config";
import {
  commentOnIssue,
  commitUrl,
  createIssue,
  githubReady,
  listIssues,
  runUrl,
  updateIssue
} from "./github";
import { agentMention, notify } from "./notify";

/**
 * The Deploy workflow's last step. A failed deploy of `main` opens (or adds
 * to) the one `deploy-failed` issue and alerts; the next good deploy closes
 * it. The failed step's output is in the dev logs (`--source ci`).
 */

const LABEL = "deploy-failed";

function sha() {
  const full =
    process.env.GITHUB_SHA ??
    execSync("git rev-parse HEAD", { encoding: "utf8" });
  return full.trim().slice(0, 7);
}

async function openIssues() {
  return (await listIssues(LABEL)).filter((issue) => issue.state === "open");
}

/** `--smoke`/`--rollback` are those steps' outcomes: success, failure, skipped. */
export async function deployFailed(args: string[]) {
  if (!githubReady) return;
  const { flags } = parseFlags(args);
  const version = sha();
  const smokeFailed = flags.smoke === "failure";
  const live =
    flags.rollback === "success"
      ? "It was **rolled back**; the previous version is serving."
      : smokeFailed
        ? "It was **not rolled back**: the broken version may still be live."
        : "Nothing new was deployed; the previous version is still serving.";
  const report = [
    `Deploying [\`${version}\`](${commitUrl(version)}) failed${smokeFailed ? " its smoke test" : ""}. ${live}`,
    "",
    `- Run: ${runUrl() || "local"}`,
    "- Why: `bun run logs --source ci --since 1d --level error`",
    "",
    "Fix it on `main` (see `.agents/skills/release-loop/SKILL.md`); this issue closes itself on the next successful deploy."
  ].join("\n");

  const [open] = await openIssues();
  if (open) {
    await commentOnIssue(open.number, report + agentMention());
  }
  const issue =
    open ??
    (await createIssue("Deploy to production failed", report + agentMention(), [
      LABEL
    ]));
  await notify(
    `❌ Deploy of ${version} failed${flags.rollback === "success" ? " and was rolled back" : ""}\n${issue.html_url}`
  );
}

export async function deploySucceeded(_args: string[]) {
  if (!githubReady) return;
  const version = sha();
  const issues = await openIssues();
  await Promise.all(
    issues.map(async (issue) => {
      await commentOnIssue(
        issue.number,
        `Fixed: [\`${version}\`](${commitUrl(version)}) deployed and passed its smoke test.`
      );
      await updateIssue(issue.number, { state: "closed" });
      await notify(`✅ Deploy fixed by ${version}\n${issue.html_url}`);
    })
  );
}
