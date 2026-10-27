import { DurableObject } from "cloudflare:workers";

/** Output longer than this is cut so one command can't flood the context. */
const MAX_OUTPUT = 8000;

/**
 * Cloudflare's managed image (Node.js 24 on Debian Trixie slim). It needs no
 * Dockerfile or registry push, so deploys don't build anything.
 */
const IMAGE = "cloudflare/debian-trixie";

/**
 * Each script starts in /workspace (created on first use) and takes the
 * command or path as "$1", so nothing from the model is spliced into it.
 */
const IN_WORKSPACE = "mkdir -p /workspace && cd /workspace && ";

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
  private ensureRunning() {
    const container = this.ctx.container;
    if (!container) throw new Error("The sandbox container is not configured");
    if (!container.running) {
      container.start({
        image: IMAGE,
        // The image's default command is `node`, which would exit at once.
        entrypoint: ["sleep", "infinity"],
        enableInternet: true
      });
    }
    return container;
  }

  private async sh(
    script: string,
    arg: string,
    options: { stdin?: ReadableStream; timeoutMs?: number } = {}
  ): Promise<CommandResult> {
    const container = this.ensureRunning();
    const process = await container.exec(
      ["sh", "-c", IN_WORKSPACE + script, "sh", arg],
      {
        stdin: options.stdin,
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000)
      }
    );
    const { exitCode, stdout, stderr } = await process.output();
    const decoder = new TextDecoder();
    return {
      exitCode,
      stdout: decoder.decode(stdout),
      stderr: decoder.decode(stderr)
    };
  }

  async runCommand(
    command: string,
    timeoutMs = 60_000
  ): Promise<CommandResult> {
    const result = await this.sh('eval "$1"', command, { timeoutMs });
    return {
      exitCode: result.exitCode,
      stdout: clip(result.stdout),
      stderr: clip(result.stderr)
    };
  }

  async writeFile(path: string, content: string) {
    const result = await this.sh(
      'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"',
      path,
      { stdin: new Blob([content]).stream() }
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Could not write ${path}`);
    }
    return `Wrote ${content.length} characters to ${path}.`;
  }

  async readFile(path: string) {
    const result = await this.sh('cat -- "$1"', path);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Could not read ${path}`);
    }
    return clip(result.stdout);
  }
}
