import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";
import { runtimeStepWords } from "./words";

/** What each recovery choice does, as a person reads it. */
const CHOICE: Readonly<Record<string, string>> = Object.freeze({
  skip_satisfied_node: "to move on, because what this step does is already on the page",
  await_recorded_state: "to wait for the page to catch up, then try the step again",
  clear_interference: "to clear what was in the way, then try the step again",
  retry_node: "to try the step again",
  deterministic_path: "to follow the Flow's own way on for when this step fails",
  reroute: "to take another way on",
  approved_runtime_patch: "to apply an approved change to this step",
  llm_diagnosis: "to ask the model what went wrong"
});

/**
 * The recovery ladder's choice for this attempt: the trace's
 * `recoveryDecision.selected`, or the action record's copy of it
 * (`metadata.recoverySelected`). A decision with no choice says the ladder
 * found nothing more to try.
 */
export function runtimeLadderLine(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine | undefined {
  const decision = runtimeAttemptRecord(attempt, "recoveryDecision");
  const selected = runtimeAttemptRecord(decision, "selected") ?? runtimeAttemptRecord(attempt, "recoverySelected");
  if (!selected) return decision ? { kind: "ladder", text: "Recovery found nothing more to try for this step." } : undefined;
  const choice = CHOICE[String(selected.kind)] ?? "to try another way on";
  const target = typeof selected.targetNodeId === "string" && selected.targetNodeId && selected.targetNodeId !== (attempt as { nodeId?: unknown }).nodeId
    ? `, at ${runtimeStepWords(selected.targetNodeId, options)}`
    : "";
  return { kind: "ladder", text: `Recovery chose ${choice}${target}.` };
}
