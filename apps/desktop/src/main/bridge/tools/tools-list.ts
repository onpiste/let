import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { which } from "../which";
import { defineTool, type ToolContext } from "./define";
import { text } from "./result";

/** Tells the model which command-line programs run_command can rely on. */
export function registerToolsList(server: McpServer, ctx: ToolContext) {
  defineTool(
    server,
    ctx,
    "list_tools",
    "Report the operating system and which common command-line programs (ffmpeg, ImageMagick, pandoc, …) are installed on the user's computer.",
    z.object({}),
    () => {
      const lines = ctx.policy.probe.map(
        (name) => `${name}: ${which(name) ? "installed" : "not installed"}`
      );
      return text(
        [`os: ${process.platform} ${process.arch}`, ...lines].join("\n")
      );
    }
  );
}
