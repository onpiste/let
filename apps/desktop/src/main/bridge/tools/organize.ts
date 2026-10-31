import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveInRoots } from "../paths";
import { defineTool, type ToolContext } from "./define";
import { failure, text } from "./result";

const SKIP = new Set([".git", "node_modules"]);
const MAX_FOUND = 500;

/** `*` and `?` match within a name; `**` also crosses folders (or none). */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**/", "\u0001")
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]")
    .replaceAll("\u0001", "(?:.*/)?")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${body}$`, "i");
}

type Found = { path: string; size: number; modified: string };

type Keep = (rel: string, size: number, mtimeMs: number) => boolean;

/** Visits one directory level, then recurses into the next. */
async function walkLevel(
  start: string,
  level: string[],
  keep: Keep,
  found: Found[]
): Promise<void> {
  if (level.length === 0 || found.length >= MAX_FOUND) return;
  const listings = await Promise.all(
    level.map(async (dir) => ({
      dir,
      entries: await readdir(dir, { withFileTypes: true }).catch(() => [])
    }))
  );
  const next: string[] = [];
  const files: string[] = [];
  for (const { dir, entries } of listings) {
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) next.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  const stats = await Promise.all(files.map((f) => stat(f)));
  files.forEach((file, i) => {
    const info = stats[i];
    const rel = relative(start, file).replaceAll("\\", "/");
    if (info && keep(rel, info.size, info.mtimeMs)) {
      found.push({
        path: file,
        size: info.size,
        modified: info.mtime.toISOString()
      });
    }
  });
  await walkLevel(start, next, keep, found);
}

async function walk(
  start: string,
  keep: Keep
): Promise<{ found: Found[]; truncated: boolean }> {
  const found: Found[] = [];
  await walkLevel(start, [start], keep, found);
  return {
    found: found.slice(0, MAX_FOUND),
    truncated: found.length > MAX_FOUND
  };
}

async function moveOne(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch {
    // Different drive: copy, then remove the original.
    await cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await rm(from, { recursive: true });
  }
}

export function registerOrganizeTools(server: McpServer, ctx: ToolContext) {
  const { roots } = ctx.policy;

  defineTool(
    server,
    ctx,
    "find_files",
    `Find files under a folder on the user's computer by name pattern, size or modified date. Returns at most ${MAX_FOUND}.`,
    z.object({
      path: z.string().default("."),
      pattern: z
        .string()
        .default("**")
        .describe("Glob such as **/*.jpg or *.pdf, matched case-insensitively"),
      minSizeKB: z.number().min(0).optional(),
      maxSizeKB: z.number().min(0).optional(),
      modifiedAfter: z.string().optional().describe("ISO 8601 date"),
      modifiedBefore: z.string().optional().describe("ISO 8601 date")
    }),
    async (a) => {
      try {
        const dir = await resolveInRoots(roots, a.path);
        const after = a.modifiedAfter ? Date.parse(a.modifiedAfter) : null;
        const before = a.modifiedBefore ? Date.parse(a.modifiedBefore) : null;
        if (Number.isNaN(after) || Number.isNaN(before)) {
          return failure("modifiedAfter/modifiedBefore must be ISO dates.");
        }
        const matcher = globToRegExp(a.pattern);
        const { found, truncated } = await walk(dir, (rel, size, mtime) => {
          if (!matcher.test(rel) && !matcher.test(basename(rel))) return false;
          if (a.minSizeKB !== undefined && size < a.minSizeKB * 1024)
            return false;
          if (a.maxSizeKB !== undefined && size > a.maxSizeKB * 1024)
            return false;
          if (after !== null && mtime < after) return false;
          return before === null || mtime <= before;
        });
        const lines = found.map((f) => `${f.path}\t${f.size}\t${f.modified}`);
        if (truncated)
          lines.push(`[more than ${MAX_FOUND} matches; narrow it]`);
        return text(lines.join("\n") || "(no matches)");
      } catch (error) {
        return failure(error);
      }
    }
  );

  defineTool(
    server,
    ctx,
    "move_files",
    "Move or rename files and folders. It previews by default (dryRun true): show the user the plan, then call again with dryRun false. Never overwrites an existing file.",
    z.object({
      moves: z
        .array(z.object({ from: z.string(), to: z.string() }))
        .min(1)
        .max(1000),
      dryRun: z.boolean().default(true)
    }),
    async ({ moves, dryRun }) => {
      try {
        const plan = await Promise.all(
          moves.map(async (m) => ({
            from: await resolveInRoots(roots, m.from),
            to: await resolveInRoots(roots, m.to)
          }))
        );
        const targets = new Set<string>();
        const checks = await Promise.all(
          plan.map(async ({ from, to }) => {
            if (targets.has(to)) return `${to} is the target of two moves`;
            targets.add(to);
            if (
              await stat(from).then(
                () => false,
                () => true
              )
            ) {
              return `${from} does not exist`;
            }
            if (
              await stat(to).then(
                () => true,
                () => false
              )
            ) {
              return `${to} already exists`;
            }
            return null;
          })
        );
        const problems = checks.filter((c): c is string => c !== null);
        if (problems.length > 0) {
          return failure(`Nothing was moved:\n${problems.join("\n")}`);
        }
        const lines = plan.map(({ from, to }) => `${from} -> ${to}`);
        if (dryRun) return text(`Plan (not applied):\n${lines.join("\n")}`);
        // Sequential on purpose: a failure stops with a clear done/not-done split.
        let done = 0;
        try {
          for (const { from, to } of plan) {
            // oxlint-disable-next-line no-await-in-loop -- ordered, stop at first error
            await moveOne(from, to);
            done += 1;
          }
        } catch (error) {
          return failure(
            `Moved ${done} of ${plan.length}, then stopped: ${String(error)}`
          );
        }
        return text(`Moved ${done} item(s):\n${lines.join("\n")}`);
      } catch (error) {
        return failure(error);
      }
    }
  );
}
