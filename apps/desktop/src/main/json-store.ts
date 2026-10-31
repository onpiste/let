import { readFileSync, writeFileSync } from "node:fs";

/** A small settings file: defaults overlaid with what was saved. */
export class JsonStore<T extends object> {
  private current: T;

  constructor(
    private readonly path: string,
    defaults: T
  ) {
    this.current = { ...defaults, ...this.read() };
  }

  get(): T {
    return this.current;
  }

  update(patch: Partial<T>): T {
    this.current = { ...this.current, ...patch };
    writeFileSync(this.path, JSON.stringify(this.current, null, 2));
    return this.current;
  }

  private read(): Partial<T> {
    try {
      // Trust boundary: a file the user may have edited by hand.
      return JSON.parse(readFileSync(this.path, "utf8")) as Partial<T>;
    } catch {
      return {};
    }
  }
}
