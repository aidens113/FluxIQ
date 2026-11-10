import type { ResultGroup } from "./types";

/** Which filter group a run status falls in. An interrupted run counts as failed: it did not finish its job. */
export function resultGroup(status: string): ResultGroup {
  switch (status) {
    case "succeeded": return "passed";
    case "cancelled": return "stopped";
    case "running":
    case "waiting":
    case "queued": return "running";
    default: return "failed";
  }
}
