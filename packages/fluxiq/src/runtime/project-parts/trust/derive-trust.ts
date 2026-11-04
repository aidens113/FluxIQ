// How far a part version has been proven, derived whenever its card is read and
// never stored (a stored tier would outlive the failure that should have lowered
// it).
//
// It reuses the rule a Flow change is trusted by (`flow-change/confidence.ts`), so
// the library and the improvement loop cannot disagree about what "established"
// means:
//
// - a `confirmed` run that asked a model is a succeeded trial; one that asked
//   none is a succeeded replay;
// - a `refuted` run is a failure, and a failure ends the replays counted so far;
// - `unverified` and `no_result` runs are left out;
// - the rule's lowest tier, `unverified`, is the contract's `unproven`.
//
// A part that can cause something lasting needs the extra replay the rule asks of
// a change that can do harm.
import type { AutomationStudioAttemptActClass, AutomationStudioSubflowCardTrust } from "@fluxiq/contracts/automation";
import type { AutomationStudioAdaptationRiskLevel, AutomationStudioFlowAdaptationValidationResult } from "../../../flows/authoring/model/index.ts";
import { decideAutomationStudioChangeConfidence } from "../../adaptation/flow-change/index.ts";
import type { AutomationStudioPartTrustEvidence } from "./types.ts";

export function deriveAutomationStudioPartTrust(input: {
  evidence: readonly AutomationStudioPartTrustEvidence[];
  lastingClasses: readonly AutomationStudioAttemptActClass[];
}): AutomationStudioSubflowCardTrust {
  const validationResults: AutomationStudioFlowAdaptationValidationResult[] = [];
  let judgedYes = 0;
  let failures = 0;
  let lastFailureAtMs: number | undefined;
  input.evidence.forEach((entry, index) => {
    if (entry.result !== "confirmed" && entry.result !== "refuted") return;
    const checkedAt = Math.max(0, Math.trunc(entry.atMs));
    const confirmed = entry.result === "confirmed";
    validationResults.push({ runId: `evidence-${index}`, status: confirmed ? "succeeded" : "failed", checkedAt, kind: entry.zeroModel ? "replay" : "trial" });
    if (confirmed) judgedYes += 1;
    else {
      failures += 1;
      lastFailureAtMs = Math.max(lastFailureAtMs ?? 0, checkedAt);
    }
  });
  const decision = decideAutomationStudioChangeConfidence({ validationResults, riskLevel: riskOf(input.lastingClasses) });
  const counts = { judgedYes, zeroModelRuns: decision.replays, failures };
  const tier = decision.tier === "unverified" ? "unproven" : decision.tier;
  return lastFailureAtMs === undefined ? { tier, counts } : { tier, counts, lastFailureAtMs };
}

function riskOf(classes: readonly AutomationStudioAttemptActClass[]): AutomationStudioAdaptationRiskLevel {
  if (classes.includes("move_money") || classes.includes("delete")) return "destructive";
  if (classes.includes("send_or_publish")) return "high";
  return classes.length > 0 ? "medium" : "low";
}
