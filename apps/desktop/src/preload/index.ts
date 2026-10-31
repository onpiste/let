import { contextBridge, ipcRenderer } from "electron";

import type { DesktopApi, DesktopState } from "../shared/api";

const api: DesktopApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  onState: (listener) => {
    const handler = (_event: unknown, state: DesktopState) => listener(state);
    ipcRenderer.on("state", handler);
    return () => {
      ipcRenderer.removeListener("state", handler);
    };
  },
  signIn: () => ipcRenderer.invoke("sign-in"),
  signOut: () => ipcRenderer.invoke("sign-out"),
  rotateSecret: () => ipcRenderer.invoke("rotate-secret"),
  setPolicy: (patch) => ipcRenderer.invoke("set-policy", patch),
  setOrigin: (origin) => ipcRenderer.invoke("set-origin", origin),
  setTunnel: (host, token) => ipcRenderer.invoke("set-tunnel", host, token),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  copyMcpUrl: () => ipcRenderer.invoke("copy-mcp-url")
};

contextBridge.exposeInMainWorld("cot", api);
