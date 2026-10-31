import { useEffect, useState } from "react";

import type { DesktopState } from "../shared/api";

/** The app's live state, pushed from the main process. */
export function useDesktop(): DesktopState | null {
  const [state, setState] = useState<DesktopState | null>(null);
  useEffect(() => {
    void window.cot.getState().then(setState);
    return window.cot.onState(setState);
  }, []);
  return state;
}

/** Runs an action and reports its failure as text for the card to show. */
export async function attempt(
  work: () => Promise<unknown>,
  onError: (message: string | null) => void
) {
  onError(null);
  try {
    await work();
  } catch (error) {
    // Electron wraps errors from invoke(); keep only the useful part.
    onError(
      String(error).replace(
        /^Error: Error invoking remote method '[^']*': /,
        ""
      )
    );
  }
}
