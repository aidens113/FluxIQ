import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioExplorationOutcome } from "./contract.ts";

/**
 * What a loop that ended cleanly actually produced.
 *
 * This is the one place `evidence_gathered` can be constructed, and it takes
 * three things to construct it: an action that returned evidence rather than a
 * refusal, bytes that action actually carried, and a completion that says
 * something. Miss any of them and the answer is `no_evidence_found`.
 *
 * Reading it the other way round is the point. A model that completes on its
 * first turn having called nothing has not explored; a model whose every call
 * was refused has gathered nothing; a completion of `{}` carries no finding.
 * Each of those used to arrive downstream as an exploration that "found nothing
 * wrong", which is a claim none of them supports.
 */
export function automationStudioExplorationCompletionOutcome(input: {
  observedActions: number;
  evidenceBytes: number;
  result: JsonObject;
}): Extract<AutomationStudioExplorationOutcome, "evidence_gathered" | "no_evidence_found"> {
  const gathered = input.observedActions > 0 && input.evidenceBytes > 0 && Object.keys(input.result).length > 0;
  return gathered ? "evidence_gathered" : "no_evidence_found";
}
