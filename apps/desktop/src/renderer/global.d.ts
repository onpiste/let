import type { DesktopApi } from "../shared/api";

declare global {
  interface Window {
    /** Exposed by the preload script. */
    cot: DesktopApi;
  }
}
