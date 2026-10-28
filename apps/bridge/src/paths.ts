import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const fold = (p: string) =>
  process.platform === "win32" ? p.toLowerCase() : p;

/** Real path of the nearest existing ancestor, so symlinks can't escape. */
async function realAncestor(path: string, from = path): Promise<string> {
  try {
    const real = await realpath(from);
    return resolve(real, relative(from, path));
  } catch {
    const parent = dirname(from);
    return parent === from ? path : realAncestor(path, parent);
  }
}

/**
 * Resolves a path (relative ones start in the first root) and throws unless
 * it is inside one of the allowed roots.
 */
export async function resolveInRoots(
  roots: string[],
  input: string
): Promise<string> {
  const base = roots[0];
  if (!base) throw new Error("No folders are allowed in bridge.json.");
  const target = await realAncestor(resolve(base, input));
  const real = await Promise.all(
    roots.map(async (root) => fold(await realAncestor(resolve(root))))
  );
  const inside = real.some((root) => {
    const rel = relative(root, fold(target));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
  if (!inside) {
    throw new Error(`${input} is outside the folders this device allows.`);
  }
  return target;
}
