import { useCallback, useState } from "react";

import type { AssistantRpc, ResearchJob, ServerEvent } from "@cot/shared";

/**
 * The Deep Research runs still going. `load` runs on every (re)connect,
 * since runs go on while the page is closed; `onEvent` then keeps the list
 * current from the server's `research-jobs` broadcasts.
 */
export function useResearchJobs() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);

  const load = useCallback((rpc: AssistantRpc) => {
    rpc
      .listResearch()
      .then(setJobs)
      .catch((error: unknown) =>
        console.warn(`Loading research runs failed: ${String(error)}`)
      );
  }, []);

  const onEvent = useCallback((event: Partial<ServerEvent>) => {
    if (event.type === "research-jobs" && event.jobs) setJobs(event.jobs);
  }, []);

  return { jobs, load, onEvent };
}
