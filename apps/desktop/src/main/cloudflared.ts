import { createHash } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { run } from "./bridge/proc";
import { which } from "./bridge/which";

const LATEST =
  "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";

type Release = {
  assets: { name: string; browser_download_url: string; digest?: string }[];
};

/** The release asset for this OS and CPU (Windows on ARM runs the x64 build). */
function assetName(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string | null {
  const cpu = arch === "arm64" ? "arm64" : arch === "x64" ? "amd64" : null;
  if (platform === "darwin" && cpu) return `cloudflared-darwin-${cpu}.tgz`;
  if (platform === "win32") return "cloudflared-windows-amd64.exe";
  if (platform === "linux" && cpu) return `cloudflared-linux-${cpu}`;
  return null;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * The cloudflared to run: one already on PATH, one downloaded earlier, or the
 * latest release fetched now. The download is checked against the SHA-256
 * GitHub publishes for the asset and refused if it is missing or differs.
 */
export async function ensureCloudflared(binDir: string): Promise<string> {
  const installed = which("cloudflared");
  if (installed) return installed;

  const local = join(
    binDir,
    process.platform === "win32" ? "cloudflared.exe" : "cloudflared"
  );
  if (which(local)) return local;

  const name = assetName();
  if (!name)
    throw new Error(
      `cloudflared has no build for ${process.platform}/${process.arch}.`
    );
  const meta = await fetch(LATEST, {
    headers: { accept: "application/vnd.github+json" }
  });
  if (!meta.ok)
    throw new Error(`Could not look up cloudflared (${meta.status}).`);
  // Trust boundary: GitHub's JSON.
  const asset = ((await meta.json()) as Release).assets.find(
    (a) => a.name === name
  );
  const expected = asset?.digest?.replace(/^sha256:/, "");
  if (!asset || !expected)
    throw new Error(`No verifiable cloudflared release asset ${name}.`);

  const data = await download(asset.browser_download_url);
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expected)
    throw new Error("The cloudflared download failed its checksum.");

  await mkdir(binDir, { recursive: true });
  if (name.endsWith(".tgz")) {
    const archive = join(binDir, name);
    await writeFile(archive, data);
    const extracted = await run(["tar", "-xzf", archive, "-C", binDir], {
      cwd: binDir,
      timeoutMs: 60_000
    });
    await rm(archive, { force: true });
    if (extracted.exitCode !== 0) throw new Error(extracted.output);
  } else {
    await writeFile(`${local}.part`, data);
    await rename(`${local}.part`, local);
  }
  await chmod(local, 0o755);
  return local;
}
