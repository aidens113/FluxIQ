// A reply the loop read that it still cannot act on as a decision.
//
// **These used to end the loop, as a bare `llm_evidence_loop.invalid_decision`**
// (`flow_bootstrap.evidence_invalid_decision` to the person): a reply that was
// JSON but no decision shape the loop reads -- a tool call with a key the
// grammar does not list, an `amend_draft` whose every amendment was mistyped --
// and a decision of a kind the schema did not offer, such as finishing before
// the first tool call. Each is one paid call that produced nothing, exactly as a
// completion the check refused is, and a loop that asks again after an unusable
// decision now asks again after these too, with the reason and the accepted
// shapes (`../unusable-decision.ts`, which says what each code below means to
// the model). They count toward the no-progress guard like any other refusal,
// because sending the same wrong shape again is the model repeating itself.
import type { AutomationStudioLlmUsageSummary } from "../harness.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "./decision.ts";
import { automationStudioLlmEvidenceDecisionIssueCodes } from "../evidence-loop-decision.ts";

/** A `complete` decision where completion was not offered. What it means to the model is in `../unusable-decision.ts`. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETE_NOT_OFFERED_CODE = "llm_evidence_loop.complete_not_offered";
/** An `amend_draft` decision where editing the draft was not offered. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_AMEND_NOT_OFFERED_CODE = "llm_evidence_loop.amend_not_offered";
/** A reply that parsed and was not a decision of any accepted shape. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_SHAPE_INVALID_CODE = "llm_evidence_loop.decision_shape_invalid";

const USAGE_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "cacheHitInputTokens", "cacheMissInputTokens"] as const;

/**
 * Why a reply that was read cannot be acted on, and what it cost where the loop
 * has not counted that yet; or nothing when it is a decision this iteration
 * offered.
 */
export function automationStudioLlmEvidenceDecisionRefusal(
  /** What `decide` returned. */
  raw: unknown,
  /** What the loop read out of it. */
  decision: AutomationStudioLlmEvidenceLoopDecision | undefined,
  offered: { complete: boolean; amend: boolean }
): { issueCodes: string[]; usage?: AutomationStudioLlmUsageSummary } | undefined {
  if (!decision) {
    const usage = usageOf(raw);
    // A tool call the grammar read and refused for a reason it can name -- a
    // binding on a node call that runs now, or one a written call cannot use
    // (t252) -- says that reason rather than "not a shape".
    const named = automationStudioLlmEvidenceDecisionIssueCodes(raw);
    return { issueCodes: named ?? [AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_SHAPE_INVALID_CODE], ...(usage ? { usage } : {}) };
  }
  if (decision.kind === "complete" && !offered.complete) return { issueCodes: [AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETE_NOT_OFFERED_CODE] };
  if (decision.kind === "amend_draft" && !offered.amend) return { issueCodes: [AUTOMATION_STUDIO_LLM_EVIDENCE_AMEND_NOT_OFFERED_CODE] };
  return undefined;
}

/** The usage a caller attached to a decision the loop could not read, bounded to counts and a cost. */
function usageOf(raw: unknown): AutomationStudioLlmUsageSummary | undefined {
  const usage = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { usage?: unknown }).usage : undefined;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  const record = usage as Record<string, unknown>;
  const read: AutomationStudioLlmUsageSummary = {};
  for (const field of USAGE_FIELDS) {
    const count = record[field];
    if (Number.isSafeInteger(count) && (count as number) >= 0) read[field] = count as number;
  }
  const cost = record.estimatedCostUsd;
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) read.estimatedCostUsd = cost;
  return Object.keys(read).length ? read : undefined;
}
