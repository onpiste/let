import { type ErrorGroup, groupErrors, type LogEntry } from "@cot/shared";

import {
  commentOnIssue,
  createIssue,
  inOrder,
  type Issue,
  listIssues,
  updateIssue
} from "./github";
import {
  issueBody,
  issueTitle,
  readState,
  shownVersions,
  type State
} from "./issue-body";
import { agentMention, notify } from "./notify";

/**
 * Files production errors as GitHub issues, one per problem:
 *
 * - a new fingerprint opens an issue (label `prod-error`) and alerts;
 * - more of an open one only updates its counts, silently;
 * - one that returns after its issue was closed as completed reopens it
 *   with the `regression` label and alerts: the fix didn't hold;
 * - one closed as "not planned" is muted for good.
 *
 * The issue body carries the state (see issue-body.ts), so the watcher
 * needs no storage of its own and overlapping runs never count twice.
 */

const LABEL = "prod-error";
const REGRESSION = "regression";
/** A flood is one alert, not fifty: the rest wait for the next run. */
const MAX_NEW_PER_RUN = 5;
/** Closing by a fix commit comes minutes before its deploy is live. */
const DEPLOY_GRACE_MS = 30 * 60 * 1000;

/** " on `sha`, `sha`" for the versions safe to show, or nothing. */
function versionsNote(versions: string[]) {
  const shown = shownVersions(versions);
  return shown.length > 0 ? ` on \`${shown.join("`, `")}\`` : "";
}

function after(entries: LogEntry[], ts: string) {
  const from = Date.parse(ts);
  return entries.filter((entry) => Date.parse(entry.ts) > from);
}

function merge(state: State, fresh: ErrorGroup): State {
  return {
    ...state,
    count: state.count + fresh.count,
    lastSeen: fresh.lastSeen,
    users: Math.max(state.users, fresh.users),
    versions: [...new Set([...state.versions, ...fresh.versions])].slice(-10)
  };
}

async function reopen(issue: Issue, state: State, fresh: ErrorGroup) {
  const next = merge(state, fresh);
  await updateIssue(issue.number, {
    state: "open",
    labels: [LABEL, REGRESSION],
    body: issueBody(next, fresh)
  });
  await commentOnIssue(
    issue.number,
    `**Regression.** Seen ${fresh.count} more time(s) since this was closed, last at ${fresh.lastSeen}${versionsNote(fresh.versions)}. The fix did not hold: add a test that reproduces it before fixing again.${agentMention()}`
  );
  await notify(`🔁 Regression: ${issue.title}\n${issue.html_url}`);
}

async function open(group: ErrorGroup) {
  const state: State = {
    fp: group.fingerprint,
    count: group.count,
    firstSeen: group.firstSeen,
    lastSeen: group.lastSeen,
    users: group.users,
    versions: group.versions
  };
  const issue = await createIssue(
    issueTitle(group),
    issueBody(state, group) + agentMention(),
    [LABEL]
  );
  await notify(
    `🚨 New production error (${group.count}×): ${issue.title}\n${issue.html_url}`
  );
}

export async function syncIssues(entries: LogEntry[]) {
  const existing = new Map<string, { issue: Issue; state: State }>();
  // Newest first, so a fingerprint maps to its latest issue.
  for (const issue of (await listIssues(LABEL)).toReversed()) {
    const state = readState(issue.body ?? "");
    if (state) existing.set(state.fp, { issue, state });
  }

  const summary = { opened: 0, updated: 0, reopened: 0, muted: 0, deferred: 0 };
  const writes: (() => Promise<void>)[] = [];
  // Most frequent first, so the cap on new issues keeps the worst ones.
  const groups = groupErrors(entries).toSorted((a, b) => b.count - a.count);
  for (const group of groups) {
    const known = existing.get(group.fingerprint);
    if (!known) {
      if (summary.opened >= MAX_NEW_PER_RUN) {
        summary.deferred += 1;
      } else {
        writes.push(() => open(group));
        summary.opened += 1;
      }
      continue;
    }

    const { issue, state } = known;
    if (issue.state === "closed" && issue.state_reason === "not_planned") {
      summary.muted += 1;
      continue;
    }
    // Only what this issue hasn't counted yet; for a closed one, only what
    // happened once the fix had time to deploy.
    const closedAt = Date.parse(issue.closed_at ?? "");
    const since =
      issue.state === "closed" && !Number.isNaN(closedAt)
        ? new Date(
            Math.max(Date.parse(state.lastSeen), closedAt + DEPLOY_GRACE_MS)
          ).toISOString()
        : state.lastSeen;
    const fresh = groupErrors(after(entries, since)).find(
      (candidate) => candidate.fingerprint === group.fingerprint
    );
    if (!fresh) continue;
    if (issue.state === "closed") {
      writes.push(() => reopen(issue, state, fresh));
      summary.reopened += 1;
    } else {
      writes.push(async () => {
        await updateIssue(issue.number, {
          body: issueBody(merge(state, fresh), fresh)
        });
      });
      summary.updated += 1;
    }
  }
  await inOrder(writes);
  return summary;
}
