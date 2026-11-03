import { emitAutomationStudioActivityStepRecovery } from "./recovery.ts";

/**
 * Says what a stale target's re-acquire came to on a run step (t786, design
 * D8): one `step` row with a `reacquire` recovery about the node (`nodeId`),
 * `succeeded` when the same item was found again, `failed` when it is gone.
 * Nothing is said when the host could not tell (`unmatched`) or the source
 * could not be re-run (`unavailable`): the retry or failure line already says
 * what happened next.
 *
 * The subject is Core's own words, naming the source step by its authored
 * label at most -- "Found the item from “Read the posts” again", "The item from
 * “Read the posts” is gone" -- and never page text: not the row, not the item.
 */
export function emitAutomationStudioActivityStepReacquire(input: { nodeId: string; outcome: "found" | "gone" | "unmatched" | "unavailable"; sourceLabel?: string | undefined }): void {
  if (input.outcome !== "found" && input.outcome !== "gone") return;
  const label = input.sourceLabel?.trim();
  const from = label ? ` from “${label}”` : "";
  const subject = input.outcome === "found" ? `Found the item${from} again` : `The item${from} is gone`;
  emitAutomationStudioActivityStepRecovery({ nodeId: input.nodeId, recovery: { kind: "reacquire", subject, outcome: input.outcome === "found" ? "succeeded" : "failed" } });
}
