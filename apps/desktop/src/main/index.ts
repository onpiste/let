import { hostname } from "node:os";
import { join } from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  safeStorage,
  shell,
  Tray
} from "electron";

import type { DesktopState } from "../shared/api";
import { defaultPolicy } from "./bridge/policy";
import { ensureCloudflared } from "./cloudflared";
import { Controller, type Prefs } from "./controller";
import { registerIpc } from "./ipc";
import { JsonStore } from "./json-store";
import { Vault } from "./vault";

// Forks point this at their own deployment (MAIN_VITE_COT_ORIGIN at build
// time); the window can also change it.
const DEFAULT_ORIGIN =
  import.meta.env.MAIN_VITE_COT_ORIGIN ?? "https://runlet.us";

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: Controller | null = null;

function showWindow() {
  if (window) {
    window.show();
    window.focus();
    return;
  }
  window = new BrowserWindow({
    width: 640,
    height: 760,
    title: "Cot Desktop",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setMenuBarVisibility(false);
  // The window only ever shows our own page; links go to the real browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => {
    window = null;
    app.dock?.hide();
  });
  app.dock?.show().catch(() => {});
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void window.loadURL(dev);
  else
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

function trayLabel(state: DesktopState): string {
  if (state.needsSignIn) return "Sign in to Cot";
  if (state.link.status === "registered") return "Connected to Cot";
  if (state.link.status === "error") return "Connection problem";
  return state.tunnel.status === "up" ? "Connecting…" : "Starting…";
}

function updateTray(state: DesktopState) {
  if (!tray) return;
  tray.setToolTip(`Cot Desktop: ${trayLabel(state)}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: trayLabel(state), enabled: false },
      { type: "separator" },
      { label: "Open settings", click: showWindow },
      {
        label: "Start at login",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", showWindow);
  await app.whenReady();
  if (!safeStorage.isEncryptionAvailable()) {
    dialog.showErrorBox(
      "Cot Desktop",
      "This system has no secure storage for the sign-in token (on Linux, install a keyring such as gnome-keyring)."
    );
    app.quit();
    return;
  }
  const dir = app.getPath("userData");
  controller = new Controller({
    vault: new Vault(join(dir, "vault.bin"), {
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (data) => safeStorage.decryptString(data)
    }),
    policy: new JsonStore(join(dir, "policy.json"), defaultPolicy()),
    prefs: new JsonStore<Prefs>(join(dir, "prefs.json"), {
      origin: DEFAULT_ORIGIN,
      tunnelHost: ""
    }),
    computerName: hostname(),
    openBrowser: (url) => void shell.openExternal(url),
    cloudflared: () => ensureCloudflared(join(dir, "bin")),
    onChange: (state) => {
      window?.webContents.send("state", state);
      updateTray(state);
    }
  });
  registerIpc(controller, () => window);

  tray = new Tray(
    nativeImage.createFromPath(
      join(import.meta.dirname, "../../resources/trayTemplate.png")
    )
  );
  tray.on("click", showWindow);
  updateTray(controller.state());
  await controller.start();
  // First run: the window is where the owner signs in.
  if (controller.state().needsSignIn) showWindow();
}

// Closing the window keeps the app (and the bridge) running in the tray.
app.on("window-all-closed", () => {});
app.on("before-quit", () => void controller?.stop());
void main();
