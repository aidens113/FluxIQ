// A generated adaptation as a caller may read it: every field checked and
// copied by name, so a build that answered out of bounds fails here rather than
// reaching a client.

import type { GenerateFlowBootstrapAdaptationResponse } from "../../../../api-contracts/automation.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS } from "../../../../runtime/loop-limits/index.ts";
import type { AutomationStudioCandidateDraftTrial, AutomationStudioGeneratedCandidateTrial } from "../flow-bootstrap-commands/index.ts";
import { boundedWholeNumber } from "../flow-settings-requests/index.ts";
import { boundedIdentifier } from "./bounded-identifier.ts";

export function sanitizedFlowBootstrapGeneration(value: GenerateFlowBootstrapAdaptationResponse): GenerateFlowBootstrapAdaptationResponse {
  const status = value.status;
  if (status !== "proposed" && status !== "draft") throw new Error("Flow bootstrap generation returned an invalid status.");
  if (status === "proposed" && !["low", "medium", "high", "destructive"].includes(value.riskLevel)) throw new Error("Flow bootstrap generation returned an invalid risk level.");
  if (!Array.isArray(value.sourceInstructionIds) || value.sourceInstructionIds.length > 100) throw new Error("Flow bootstrap generation returned invalid instruction references.");
  const sourceInstructionIds = value.sourceInstructionIds.map((id) => boundedIdentifier(id, "Instruction"));
  const accounting = value.accounting;
  if (!accounting || typeof accounting !== "object") throw new Error("Flow bootstrap generation accounting is missing.");
  const sanitizedAccounting: GenerateFlowBootstrapAdaptationResponse["accounting"] = {
    requestId: boundedIdentifier(accounting.requestId, "LLM request"),
    estimatedInputTokens: boundedAccountingInteger(accounting.estimatedInputTokens, "estimated input tokens"),
    ...(accounting.provider !== undefined ? { provider: boundedLabel(accounting.provider, "LLM provider") } : {}),
    ...(accounting.model !== undefined ? { model: boundedLabel(accounting.model, "LLM model") } : {}),
    ...(accounting.inputTokens !== undefined ? { inputTokens: boundedAccountingInteger(accounting.inputTokens, "input tokens") } : {}),
    ...(accounting.outputTokens !== undefined ? { outputTokens: boundedAccountingInteger(accounting.outputTokens, "output tokens") } : {}),
    ...(accounting.totalTokens !== undefined ? { totalTokens: boundedAccountingInteger(accounting.totalTokens, "total tokens") } : {}),
    ...(accounting.estimatedCostUsd !== undefined ? { estimatedCostUsd: boundedAccountingCost(accounting.estimatedCostUsd) } : {})
  };
  const common = {
    projectId: boundedIdentifier(value.projectId, "Project"),
    flowId: boundedIdentifier(value.flowId, "Flow"),
    sourceInstructionIds,
    baseDependencyDigest: boundedIdentifier(value.baseDependencyDigest, "Dependency digest"),
    baseSettingsRevision: boundedWholeNumber(value.baseSettingsRevision, 0, Number.MAX_SAFE_INTEGER),
    accounting: sanitizedAccounting
  };
  if (value.status === "draft") {
    if (value.verification !== "not_performed" || value.promotionAllowed !== false || !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest)) throw new Error("Flow candidate draft returned invalid verification or identity.");
    return { ...common, status: "draft", candidateId: boundedIdentifier(value.candidateId, "Candidate"), revision: value.revision, digest: value.digest, verification: "not_performed", promotionAllowed: false, ...(value.trial ? { trial: sanitizedDraftTrial(value.trial) } : {}) };
  }
  return {
    ...common, status: "proposed", adaptationId: boundedIdentifier(value.adaptationId, "Adaptation"), riskLevel: value.riskLevel,
    // Carried whole, like the same request on the failure diagnostic beside it:
    // it is Core's own object, built by Core's gate from Core's own words, and
    // a field-by-field copy here would be a second place to keep in step with
    // the request type. A build that finished carrying one cannot be applied
    // until it is answered, so the caller has to be able to show it.
    ...(value.permissionRequest ? { permissionRequest: value.permissionRequest } : {}),
    // Which candidate and trial run's confirmed yes made a candidate-mode proposal (t340); the chat applies a candidate's proposal only with it.
    ...(value.candidate ? { candidate: sanitizedProposalCandidate(value.candidate) } : {})
  };
}

const DRAFT_TRIAL_VERDICTS: ReadonlySet<string> = new Set(["yes", "no", "unsure", "not_judged", "execution_failed", "not_tested"]);

/** A draft's trial block, field by field: a known verdict, a bounded run id and at most twenty bounded codes. */
function sanitizedDraftTrial(trial: AutomationStudioCandidateDraftTrial): AutomationStudioCandidateDraftTrial {
  if (!DRAFT_TRIAL_VERDICTS.has(trial.verdict) || !Array.isArray(trial.codes) || trial.codes.length > 20) throw new Error("Flow candidate draft returned an invalid trial outcome.");
  return { verdict: trial.verdict, ...(trial.runId !== undefined ? { runId: boundedIdentifier(trial.runId, "Trial run") } : {}), codes: trial.codes.map((code) => boundedIdentifier(code, "Trial code")) };
}

/** A proposal's candidate block, field by field; a yes stands only after a confirming call, so two calls at least (t296). */
function sanitizedProposalCandidate(candidate: AutomationStudioGeneratedCandidateTrial): AutomationStudioGeneratedCandidateTrial {
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 1 || typeof candidate.digest !== "string" || !/^[a-f0-9]{64}$/.test(candidate.digest)
    || candidate.trial?.verdict !== "yes" || !Number.isSafeInteger(candidate.trial.calls) || candidate.trial.calls < 2) throw new Error("Flow candidate proposal returned an invalid candidate trial.");
  return { candidateId: boundedIdentifier(candidate.candidateId, "Candidate"), revision: candidate.revision, digest: candidate.digest, trial: { runId: boundedIdentifier(candidate.trial.runId, "Trial run"), verdict: "yes", calls: candidate.trial.calls } };
}

function boundedLabel(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const clean = value.trim();
  if (!clean || clean.length > 100 || /[\u0000-\u001f\u007f]/.test(clean)) throw new Error(`${label} is invalid.`);
  return clean;
}

function boundedAccountingInteger(value: unknown, label: string): number {
  // A build's totals, not one request's: an evidence-guided build adds up
  // every call it made, so it is bounded as the service and the failure
  // diagnostic bound it. One request's ceiling refused any build longer than
  // a few calls after its proposal was stored, and answered it with a bare
  // failure that carried no diagnostic.
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS) throw new Error(`Flow bootstrap generation ${label} are invalid.`);
  return value as number;
}

function boundedAccountingCost(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) throw new Error("Flow bootstrap generation cost accounting is invalid.");
  return value;
}
