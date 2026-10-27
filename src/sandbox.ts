import { Files } from "@cloudflare/sandbox";
import { DurableObject } from "cloudflare:workers";

/** Output longer than this is cut so one command can't flood the context. */
const MAX_OUTPUT = 8000;

/** The directory commands start in and file paths resolve against. */
const WORKSPACE = "/workspace";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function clip(text: string) {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n…(truncated, ${text.length} chars total)`
    : text;
}

/**
 * A Linux sandbox that belongs to one account. The Assistant reaches it over
 * RPC, so it has no access to the assistant's memory, settings or keys.
 * Container state (installed packages, files) is kept until the container
 * sleeps after inactivity, which is when /workspace is lost.
 */
export class Sandbox extends DurableObject<Env> {
  private async ensureRunning() {
    const container = this.ctx.container;
    if (!container) throw new Error("The sandbox container is not configured");
    if (!container.running) {
      container.start({
        image: container.images.sandbox,
        enableInternet: true
      });
    }
    return container;
  }

  async runCommand(
    command: string,
    timeoutMs = 60_000
  ): Promise<CommandResult> {
    const container = await this.ensureRunning();
    const process = await container.exec(["sh", "-c", command], {
      cwd: WORKSPACE,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const { exitCode, stdout, stderr } = await process.output();
    const decoder = new TextDecoder();
    return {
      exitCode,
      stdout: clip(decoder.decode(stdout)),
      stderr: clip(decoder.decode(stderr))
    };
  }

  async writeFile(path: string, content: string) {
    const container = await this.ensureRunning();
    await new Files(container).writeFile(path, content, { cwd: WORKSPACE });
    return `Wrote ${content.length} characters to ${path}.`;
  }

  async readFile(path: string) {
    const container = await this.ensureRunning();
    const response = await new Files(container).readFile(path, {
      cwd: WORKSPACE
    });
    return clip(await response.text());
  }
}
