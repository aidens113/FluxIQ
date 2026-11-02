import type { AutomationStudioRunControlSnapshot } from "../../automation-host/index.ts";
import type { AutomationStudioRunProgressFacts, AutomationStudioRunProgressStatus } from "./types.ts";

/** Finished execution takes precedence over a stale live control record. */
export function automationStudioRunProgressStatus(session: AutomationStudioRunProgressFacts, control: AutomationStudioRunControlSnapshot | null): AutomationStudioRunProgressStatus {
  switch (session.status) {
    case "queued": return "ready";
    case "succeeded": return "completed";
    case "failed": return "failed";
    case "cancelled": return "stopped";
    case "interrupted": return "interrupted";
    case "waiting": return session.trace?.parked ? "user_action_required" : "waiting";
    case "running":
      if (control?.state === "paused") return control.holder === "person" ? "user_action_required" : "paused";
      return control?.phase === "adapting" ? "adapting" : "running";
  }
}
