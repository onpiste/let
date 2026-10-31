import { clipboard, dialog, ipcMain, type BrowserWindow } from "electron";

import type { Policy } from "./bridge/policy";
import type { Controller } from "./controller";

const CALENDARS = new Set(["auto", "macos", "outlook", "ics", "khal"]);

/**
 * The window is ours, but it renders text from a model's tool calls, so every
 * value is checked as if it came from the network. Only these policy fields
 * can be changed from the window; agents and probes are edited in policy.json.
 */
function sanitizePolicy(input: unknown): Partial<Policy> {
  const patch: Partial<Policy> = {};
  if (typeof input !== "object" || input === null) return patch;
  const raw = input as Record<string, unknown>;
  if (
    Array.isArray(raw.roots) &&
    raw.roots.length > 0 &&
    raw.roots.every((r) => typeof r === "string" && r !== "")
  ) {
    patch.roots = raw.roots as string[];
  }
  if (typeof raw.allowShell === "boolean") patch.allowShell = raw.allowShell;
  if (typeof raw.calendar === "string" && CALENDARS.has(raw.calendar)) {
    patch.calendar = raw.calendar as Policy["calendar"];
  }
  if (typeof raw.icsPath === "string" && raw.icsPath !== "") {
    patch.icsPath = raw.icsPath;
  }
  return patch;
}

export function registerIpc(
  controller: Controller,
  window: () => BrowserWindow | null
) {
  ipcMain.handle("state:get", () => controller.state());
  ipcMain.handle("sign-in", () => controller.signIn());
  ipcMain.handle("sign-out", () => controller.signOut());
  ipcMain.handle("rotate-secret", () => controller.rotateSecret());
  ipcMain.handle("set-policy", (_e, patch: unknown) =>
    controller.setPolicy(sanitizePolicy(patch))
  );
  ipcMain.handle("set-origin", (_e, origin: unknown) => {
    if (
      typeof origin !== "string" ||
      !/^https?:\/\/[^\s/]+$/.test(origin.trim().replace(/\/+$/, ""))
    ) {
      throw new Error(
        "Enter the address of your Cot deployment, e.g. https://example.com"
      );
    }
    controller.setOrigin(origin);
  });
  ipcMain.handle("set-tunnel", (_e, host: unknown, token: unknown) => {
    if (typeof host !== "string" || typeof token !== "string") return;
    controller.setTunnel(host, token);
  });
  ipcMain.handle("pick-folder", async () => {
    const win = window();
    const options = { properties: ["openDirectory" as const] };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("copy-mcp-url", () => {
    const url = controller.mcpUrl();
    if (url) void clipboard.writeText(url);
    return url !== null;
  });
}
