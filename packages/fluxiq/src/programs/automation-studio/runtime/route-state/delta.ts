// Model-only projections of already flattened routing situations. Full route
// observations and signatures never pass through this representation.
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../llm/evidence-loop-decision.ts";

/** A baseline, or updates/removals relative to the actual preceding situation. */
export function automationStudioRouteSituationDelta(input: {
  seen: string;
  state: JsonObject;
  prior?: { callId: string; state: JsonObject };
}): JsonObject {
  try {
    const state = JSON.parse(automationStudioLlmEvidenceCanonicalJson(input.state)) as JsonObject;
    if (!input.prior) return { seen: input.seen, state };
    const prior = input.prior;
    const updates = Object.fromEntries(Object.entries(state).filter(([key, value]) =>
      !Object.hasOwn(prior.state, key)
      || automationStudioLlmEvidenceCanonicalJson(prior.state[key]!) !== automationStudioLlmEvidenceCanonicalJson(value)));
    const removed = Object.keys(prior.state).filter((key) => !Object.hasOwn(state, key)).sort();
    return { seen: input.seen, baseSituation: prior.callId, updates, removed };
  } catch {
    // A failed comparison must never silently classify a value as unchanged.
    throw new Error("The routing situation could not be compared for evidence.");
  }
}
