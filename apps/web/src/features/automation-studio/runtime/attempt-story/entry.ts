import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine, RuntimeAttemptStoryOptions } from "./story-line";
import { runtimeStepWords } from "./words";

/**
 * The `entry` record, on a frame's first attempt (Core's state-aware recovery
 * plan, C2, C11): where the frame began and why, from its own `kind`. The
 * Flow's usual start in the Flow itself says nothing new, so only a called
 * part's usual start is told; another way in, or a checkpoint a handler sent
 * the run back to, always is.
 */
export function runtimeEntryLine(attempt: unknown, options: RuntimeAttemptStoryOptions = {}): RuntimeAttemptStoryLine | undefined {
  const entry = runtimeAttemptRecord(attempt, "entry");
  if (!entry) return undefined;
  const step = runtimeStepWords((attempt as { nodeId?: unknown }).nodeId, options);
  if (entry.kind === "entry") return { kind: "entry", text: `Started at ${step}: the page already showed what this way in needs.` };
  if (entry.kind === "checkpoint") return { kind: "entry", text: `Started at ${step}: a handler sent the run back to this checkpoint.` };
  const inPart = typeof (attempt as { parentAttemptId?: unknown }).parentAttemptId === "string";
  return entry.kind === "default" && inPart ? { kind: "entry", text: `Started at ${step}: the part's usual start.` } : undefined;
}
