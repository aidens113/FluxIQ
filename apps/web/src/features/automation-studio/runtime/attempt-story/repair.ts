import { runtimeAttemptRecord } from "./attempt-record";
import type { RuntimeAttemptStoryLine } from "./story-line";

/**
 * The `repair` record (Core's state-aware recovery plan, C6 step 8): the
 * in-run repair a true failure asked for, by its outcome. Its reason stays in
 * the Raw JSON tab.
 */
export function runtimeRepairLine(attempt: unknown): RuntimeAttemptStoryLine | undefined {
  const repair = runtimeAttemptRecord(attempt, "repair");
  if (repair?.outcome === "held") return { kind: "repair", text: "Repaired during the run: the fix was tried and held." };
  if (repair?.outcome === "dropped") return { kind: "repair", text: "A repair was tried during the run, failed its trial and was dropped." };
  return undefined;
}
