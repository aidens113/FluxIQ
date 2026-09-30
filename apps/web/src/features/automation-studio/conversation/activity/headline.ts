// The headline of a unit of work: what it is while it runs, and how it ended.
//
// It names the work, never the step inside it, so it stays put while Core's
// sentences change underneath; the detail line carries those. The words match
// the extension's (`apps/extension/src/background/activity/headline.ts` in the
// web-automation repository), so a person reads the same status in both.

import type { ConversationActivity } from "./contracts";

export type ConversationActivityOutcome = "done" | "failed" | "waiting" | null;

/** How the event leaves its unit of work: settled, waiting on the person, or still working (null). */
export function conversationActivityOutcome(event: ConversationActivity): ConversationActivityOutcome {
  if (event.phase === "failed") return "failed";
  if (event.phase === "waiting_permission") return "waiting";
  if (event.phase === "done" || event.final === true) return "done";
  return null;
}

/** "Building your Flow", "Fixing your Flow", "Flow ready", "Run failed", and the rest. */
export function conversationActivityHeadline(kind: ConversationActivity["subject"]["kind"], outcome: ConversationActivityOutcome, repairing = false): string {
  if (outcome === "waiting") return "Waiting for your answer";
  if (outcome === "done") return kind === "run" ? "Run finished" : "Flow ready";
  if (outcome === "failed") return repairing ? "Couldn't fix your Flow" : kind === "run" ? "Run failed" : "Build failed";
  if (repairing) return "Fixing your Flow";
  return kind === "run" ? "Running your Flow" : "Building your Flow";
}
