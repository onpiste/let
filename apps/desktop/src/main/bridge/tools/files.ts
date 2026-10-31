import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveInRoots } from "../paths";
import { defineTool, type ToolContext } from "./define";
import { failure, text } from "./result";

const MAX_READ = 200_000;

export function registerFileTools(server: McpServer, ctx: ToolContext) {
  const { roots } = ctx.policy;

  defineTool(
    server,
    ctx,
    "list_dir",
    "List a folder on the user's computer. Folders end with a slash.",
    z.object({ path: z.string().default(".") }),
    async ({ path }) => {
      try {
        const dir = await resolveInRoots(roots, path);
        const entries = await readdir(dir, { withFileTypes: true });
        const lines = entries
          .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
          .toSorted();
        return text(lines.join("\n") || "(empty)");
      } catch (error) {
        return failure(error);
      }
    }
  );

  defineTool(
    server,
    ctx,
    "read_file",
    `Read a text file from the user's computer (first ${MAX_READ} characters).`,
    z.object({ path: z.string() }),
    async ({ path }) => {
      try {
        const file = await resolveInRoots(roots, path);
        if ((await stat(file)).isDirectory()) {
          return failure(`${path} is a folder; use list_dir.`);
        }
        const content = await readFile(file, "utf8");
        return text(
          content.length > MAX_READ
            ? `${content.slice(0, MAX_READ)}\n[truncated]`
            : content
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  defineTool(
    server,
    ctx,
    "write_file",
    "Write a text file on the user's computer, creating folders as needed and replacing any existing file.",
    z.object({ path: z.string(), content: z.string() }),
    async ({ path, content }) => {
      try {
        const file = await resolveInRoots(roots, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
        return text(`Wrote ${content.length} characters to ${file}.`);
      } catch (error) {
        return failure(error);
      }
    }
  );
}
