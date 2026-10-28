import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard } from "@capacitor/keyboard";

// The same web app runs in browsers and inside the iOS shell (apps/mobile),
// where Capacitor's bridge exposes device APIs. Native-only code checks this
// and keeps the browser path as the fallback.

export const isNativeApp = Capacitor.isNativePlatform();

/** A light tap on the iPhone's haptic engine; nothing in a browser. */
export function tapFeedback() {
  if (isNativeApp) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Drops iOS's up/down/done bar above the keyboard; it paints a dark strip. */
export function hideKeyboardAccessoryBar() {
  if (isNativeApp) {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  }
}
