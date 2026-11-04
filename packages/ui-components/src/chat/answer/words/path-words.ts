// How an attempt went, from its `path` alone: whether it used what was saved and, if it
// did, what it had to do beyond it. It states nothing a path does not prove, and no count
// of fixed steps. A stop or a budget-out straight after a run also reads `run_flow`, so
// "no steps had to be worked out" is said only of an attempt that got there.

import type { ChatTaskAttemptFields } from "../../ports/index.ts";

/** One plain sentence for `path`, as `status` lets it be said; none on a first attempt that explored. */
export function pathWords(path: ChatTaskAttemptFields["path"], status: string): string | undefined {
  switch (path) {
    case "explore":
      return undefined;
    case "run_flow":
      return status === "achieved" ? "Used what I saved. No steps had to be worked out again." : "Used what I saved.";
    case "run_flow_then_repair":
      return "Used what I saved, and fixed a step that had changed.";
    case "run_flow_then_explore":
      return "Used what I saved as far as it went, then worked out the rest.";
  }
}
