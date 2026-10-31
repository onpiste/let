import { statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Finds an executable on PATH (with PATHEXT shims such as .cmd on Windows). */
export function which(name: string): string | null {
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")
      : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return null;
}
