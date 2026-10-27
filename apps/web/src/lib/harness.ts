import { HARNESSES, type HarnessId } from "@cot/shared";

// The same assistant runs on two agent harnesses. Each keeps its own chat
// history; long-term memory is shared. The choice is remembered per browser.

const STORAGE_KEY = "cot:harness";

export function loadHarness(): HarnessId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in HARNESSES) return saved as HarnessId;
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return "think";
}

export function saveHarness(harness: HarnessId) {
  try {
    localStorage.setItem(STORAGE_KEY, harness);
  } catch {
    // Not persisted — fine for this session.
  }
}
