import type { HomeTone } from "./types";

/** What a run's status means to a person, and whether it is good news. */
export function runResult(status: string): { label: string; tone: HomeTone } {
  switch (status) {
    case "succeeded": return { label: "Passed", tone: "ok" };
    case "failed": return { label: "Failed", tone: "bad" };
    case "cancelled": return { label: "Stopped", tone: "neutral" };
    case "interrupted": return { label: "Interrupted", tone: "warn" };
    case "running": return { label: "Running", tone: "neutral" };
    case "waiting": return { label: "Waiting for you", tone: "warn" };
    case "queued": return { label: "Waiting to start", tone: "neutral" };
    default: return { label: "Unknown", tone: "neutral" };
  }
}
