// The same privacy boundary as full route evidence, before any delta is made.
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../llm/evidence-loop-decision.ts";
// The harness barrel reaches route-state through flow-bootstrap; use its leaf
// to keep this model projection outside that import cycle.
import { screenAutomationStudioLlmEvidence } from "../llm/harness/evidence-screen.ts";

/** Screen first, then snapshot the visible values independently of the host. */
export function automationStudioScreenRouteSituation(state: JsonObject, deniedKeys: readonly string[]): JsonObject {
  try {
    const visible = Object.fromEntries(Object.entries(state).filter(([key, value]) => {
      const screened = screenAutomationStudioLlmEvidence({ [key]: value }, deniedKeys);
      if (screened.deniedKey) throw new Error();
      return !screened.secretShaped;
    }));
    return JSON.parse(automationStudioLlmEvidenceCanonicalJson(visible)) as JsonObject;
  } catch {
    // Neither unreadable values nor callback error prose may become evidence.
    throw new Error("The routing situation could not be screened for evidence.");
  }
}
