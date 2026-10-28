import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { BridgeConfig } from "../config";
import { resolveInRoots } from "../paths";
import { failure, text } from "./result";

const MAX_READ = 200_000;

export function registerFileTools(server: McpServer, config: BridgeConfig) {
  server.registerTool(
    "list_dir",
    {
      description:
        "List a folder on the user's computer. Folders end with a slash.",
      inputSchema: z.object({ path: z.string().default(".") })
    },
    async ({ path }) => {
      try {
        const dir = await resolveInRoots(config.roots, path);
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

  server.registerTool(
    "read_file",
    {
      description: `Read a text file from the user's computer (first ${MAX_READ} characters).`,
      inputSchema: z.object({ path: z.string() })
    },
    async ({ path }) => {
      try {
        const file = await resolveInRoots(config.roots, path);
        if ((await stat(file)).isDirectory()) {
          return failure(`${path} is a folder; use list_dir.`);
        }
        const content = await readFile(file, "utf8");
        const clipped = content.length > MAX_READ;
        return text(
          clipped ? `${content.slice(0, MAX_READ)}\n[truncated]` : content
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "write_file",
    {
      description:
        "Write a text file on the user's computer, creating folders as needed and replacing any existing file.",
      inputSchema: z.object({ path: z.string(), content: z.string() })
    },
    async ({ path, content }) => {
      try {
        const file = await resolveInRoots(config.roots, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
        return text(`Wrote ${content.length} characters to ${join(file)}.`);
      } catch (error) {
        return failure(error);
      }
    }
  );
}
