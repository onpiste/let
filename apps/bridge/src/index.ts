#!/usr/bin/env bun
import { CONFIG_PATH, initConfig, loadConfig } from "./config";
import { startServer } from "./server";

const HELP = `cot-bridge: let your Cot assistant use this computer.

  init     Create ${CONFIG_PATH} and print the MCP URL
  start    Serve the bridge on localhost (expose it with cloudflared)
`;

/** CLI output; the lint rules reserve `console` for diagnostics. */
const say = (line: string) => process.stdout.write(`${line}\n`);

async function main() {
  const command = process.argv[2];
  if (command === "init") {
    const config = await initConfig();
    say(`Config: ${CONFIG_PATH}`);
    say(`Local URL: http://localhost:${config.port}/mcp/${config.token}`);
    say(
      `\nNext: cloudflared tunnel --url http://localhost:${config.port}\n` +
        "then add <tunnel URL>/mcp/<token> under Settings → MCP servers."
    );
  } else if (command === "start") {
    const config = await loadConfig();
    if (!config) {
      console.error("Run `cot-bridge init` first.");
      process.exit(1);
    }
    startServer(config);
    say(`Bridge listening on http://localhost:${config.port}`);
    say(`Allowed folders: ${config.roots.join(", ")}`);
  } else {
    say(HELP);
  }
}

await main();
