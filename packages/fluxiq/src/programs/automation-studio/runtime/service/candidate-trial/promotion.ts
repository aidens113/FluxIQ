// From a judged trial to a proposed adaptation, or to a draft that says why not.
//
// The loop never promotes (`promotionAllowed: false` on its result). After it,
// the service saves the candidate as a draft and asks here. Only a candidate
// whose standing verdict is a yes for its exact revision and digest goes on,
// and only through checks that each refuse to a kept draft:
//
// 1. the authoritative draft re-read from disk names the same candidate,
//    revision and digest, and its digest recomputes over the stored plan;
// 2. the Flow's dependency digest and settings revision are still the ones the
//    candidate was built on (an instruction edited since the trial changes the
//    digest: `FLOW_BOOTSTRAP_STALE`);
// 3. `createFlowBootstrapAdaptation` checks the base digest once more under the
//    adaptation lock and records the `candidateTrial` audit detail.
//
// Decision D2 (2026-10-07): this is the legacy create/approve/apply guarantee,
// a compare under a process-local lock, not a crash-atomic promoter. Applying
// checks the digest again under the same lock.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioCandidateFingerprint as fingerprint, type AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioBootstrapAdaptation, AutomationStudioFlowBuildPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../candidate-drafts/index.ts";
import type { AutomationStudioCandidateDraftTrial, AutomationStudioGeneratedCandidateTrial } from "../flow-bootstrap-commands/index.ts";
import type { AutomationStudioCandidateTrialRecord } from "./contracts.ts";

export type AutomationStudioCandidatePromotion =
  | { status: "proposed"; adaptation: AutomationStudioBootstrapAdaptation; candidate: AutomationStudioGeneratedCandidateTrial }
  | { status: "draft"; trial: AutomationStudioCandidateDraftTrial };

/** The proposal a standing yes earns, or the draft anything else stays. */
export async function promoteAutomationStudioCandidateTrial(input: {
  record: AutomationStudioFlowCandidateDraftRecord;
  standing: AutomationStudioCandidateTrialResult | undefined;
  trials: readonly AutomationStudioCandidateTrialRecord[];
  readAuthoritative(): Promise<AutomationStudioFlowCandidateDraftRecord | undefined>;
  currentBinding(): Promise<{ executionDigest: string; settingsRevision: number }>;
  propose(proposal: { buildPlan: AutomationStudioFlowBuildPlan; baseDependencyDigest: string; sourceInstructionIds: string[]; summary: string; candidateTrial: JsonObject }): Promise<AutomationStudioBootstrapAdaptation>;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioCandidatePromotion> {
  const { record, standing } = input, candidate = record.candidate;
  const draft = (codes: string[]): AutomationStudioCandidatePromotion => ({ status: "draft", trial: { verdict: standing?.verdict ?? "not_tested", ...(standing?.trialRunId ? { runId: standing.trialRunId } : {}), codes } });
  if (!standing) return draft(["candidate.trial_not_run"]);
  if (standing.revision !== candidate.revision || standing.digest !== candidate.digest) return draft(["candidate.trial_stale_revision"]);
  if (standing.verdict !== "yes") return draft([typeof standing.feedback.code === "string" ? standing.feedback.code : `candidate.trial_${standing.verdict}`]);
  const trial = [...input.trials].reverse().find((entry) => entry.verdict === "yes" && entry.revision === candidate.revision && entry.digest === candidate.digest && entry.trialRunId === standing.trialRunId);
  if (!trial?.trialRunId) return draft(["candidate.trial_record_missing"]);
  input.signal?.throwIfAborted();
  const stored = await input.readAuthoritative();
  if (!stored) return draft(["candidate.promotion_draft_unreadable"]);
  const recomputed = fingerprint.candidate({ projectId: stored.projectId, flowId: stored.flowId, baseDependencyDigest: stored.candidate.baseDependencyDigest, instructionText: stored.instructionText,
    buildPlan: stored.candidate.buildPlan, ...(stored.candidate.originalInstructionsDigest === undefined ? {} : { originalInstructionsDigest: stored.candidate.originalInstructionsDigest }) });
  if (stored.candidateId !== record.candidateId || stored.candidate.revision !== candidate.revision || stored.candidate.digest !== candidate.digest || recomputed !== candidate.digest) return draft(["candidate.promotion_digest_mismatch"]);
  const binding = await input.currentBinding();
  if (binding.executionDigest !== stored.candidate.baseDependencyDigest || binding.settingsRevision !== stored.baseSettingsRevision) return draft(["FLOW_BOOTSTRAP_STALE"]);
  input.signal?.throwIfAborted();
  const generated: AutomationStudioGeneratedCandidateTrial = { candidateId: stored.candidateId, revision: candidate.revision, digest: candidate.digest, trial: { runId: trial.trialRunId, verdict: "yes", calls: trial.judge.calls } };
  let adaptation: AutomationStudioBootstrapAdaptation;
  try {
    adaptation = await input.propose({ buildPlan: structuredClone(stored.candidate.buildPlan), baseDependencyDigest: stored.candidate.baseDependencyDigest, sourceInstructionIds: [...stored.sourceInstructionIds], summary: stored.candidate.summary,
      candidateTrial: { ...generated, trial: { ...generated.trial, start: trial.start.status }, trials: input.trials.length } });
  } catch (error) {
    // The base moved under the adaptation lock: the draft stays, saying so. Anything else is not a refusal of this candidate.
    if (error instanceof Error && error.message.startsWith("FLOW_BOOTSTRAP_STALE")) return draft(["FLOW_BOOTSTRAP_STALE"]);
    throw error;
  }
  return { status: "proposed", adaptation, candidate: generated };
}
