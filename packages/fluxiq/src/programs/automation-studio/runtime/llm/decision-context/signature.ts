// What makes two decisions the same decision.
//
// A decision's signature is the canonical JSON of what the model asked for and
// nothing else: the call id Core gives a call, the iteration and the summary
// are left out, because a model that resends a request resends those changed.
// Keys are sorted (`automationStudioLlmEvidenceCanonicalJson`), so the same
// input written in another key order is the same decision.
//
// An executed call and a later request answered from memory have the same
// signature -- that is the repeat the history exists to show.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendment } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";

/** The part of a decision that identifies it. The loop's own decision type satisfies it. */
export type AutomationStudioLlmDecisionContextSignatureInput =
  | { kind: "tool_call"; toolId: string; input: JsonObject }
  | { kind: "complete"; result: JsonObject }
  | { kind: "amend_draft"; amendments: readonly AutomationStudioFlowDraftAmendment[] }
  | { kind: "unusable"; issueCodes: readonly string[] };

/** The decision's signature: canonical JSON of its kind and what it asked for. */
export function automationStudioLlmDecisionContextSignature(decision: AutomationStudioLlmDecisionContextSignatureInput): string {
  if (decision.kind === "tool_call") return automationStudioLlmEvidenceCanonicalJson([decision.kind, decision.toolId, decision.input]);
  if (decision.kind === "complete") return automationStudioLlmEvidenceCanonicalJson([decision.kind, decision.result]);
  if (decision.kind === "amend_draft") {
    // An amendment is plain data the model wrote; it is JSON by construction.
    return automationStudioLlmEvidenceCanonicalJson([decision.kind, decision.amendments as unknown as JsonValue]);
  }
  return automationStudioLlmEvidenceCanonicalJson([decision.kind, [...new Set(decision.issueCodes)].sort()]);
}
