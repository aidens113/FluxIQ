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
//
// The saved Flow keeps the pace the deciding trial learned (t378). A trial that
// met a site asking it to slow down learns, per node, the least time between
// two starts that got it through (`trial.learnedPaces`, `./learned-paces.ts`);
// each matching plan node's `paceMs` is raised to the larger of what the
// script authored and what the trial learned, held to the plan's bound, in
// both the plan and its laid-out copy, before the plan is proposed. The
// adaptation writes it to the Flow node's `metadata.paceMs`
// (`flow-bootstrap/adaptation.ts`), which every later run honours. The plan
// so raised is not the bytes the trial was judged on, and that is the point:
// the trial's own learning is what is kept. The audit detail names both what
// the trial learned (`learnedPaces`) and what was raised (`raisedPaces`).
//
// A draft's codes start with its own: the trial's code, or why its yes did not
// stand. A standing trial of the same Flow (digest) at an earlier revision --
// a project build's latest finished test of a Flow it went back to (G2,
// `../project-build/run.ts`) -- keeps its own code when it is not a yes; a yes
// for another revision is still stale and never promotes. A build that ended for a reason of its own -- a project build its time
// limit stopped (`../project-build/run.ts`, t608) -- names it in the standing
// trial's `feedback.endingCodes`, and those codes follow the draft's own, so
// the code every debug and the Lab read stays first.
//
// The `created` event's trial carries whether its yes was first-ask confirmed
// (`firstAskConfirmed`, `./run.ts`, t677) where the trial's record says, beside
// its judge calls; apply records both on the saved Flow
// (`../../flow-version/judged-build-trial/`), for the playback hold.
//
// **A yes the build ended on without completing stays a draft (t753).** A
// project build whose supervisor ended unfinished, holding a whole test judged
// yes, used to hand back no trial at all, so the draft said not tested and the
// chat "It was never test-run from the start". It now hands that yes back with
// `project.build_ended_unfinished` among its ending codes
// (`../project-build-ending/codes.ts`), and a standing trial carrying it is
// kept as a draft under that code, whatever its verdict: only a completion
// stands on its yes.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioCandidateFingerprint as fingerprint, type AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS, type AutomationStudioBootstrapAdaptation, type AutomationStudioFlowBootstrapNode, type AutomationStudioFlowBuildPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../candidate-drafts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES } from "../project-build-ending/index.ts";
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
  // The build's own ending codes go after the draft's own code, which stays first (header, t608).
  const draft = (codes: string[]): AutomationStudioCandidatePromotion => ({ status: "draft", trial: { verdict: standing?.verdict ?? "not_tested", ...(standing?.trialRunId ? { runId: standing.trialRunId } : {}), codes: [...codes, ...endingCodes(standing).filter((code) => !codes.includes(code))] } });
  if (!standing) return draft(["candidate.trial_not_run"]);
  // A build that ended without completing promotes nothing, whatever its last test said (header, t753).
  if (endingCodes(standing).includes(AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES.endedUnfinished)) return draft([AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES.endedUnfinished]);
  if (standing.digest !== candidate.digest) return draft(["candidate.trial_stale_revision"]);
  // The same Flow's test that is not a yes keeps its own code, whatever revision ran it (header, G2).
  if (standing.verdict !== "yes") return draft([typeof standing.feedback.code === "string" ? standing.feedback.code : `candidate.trial_${standing.verdict}`]);
  if (standing.revision !== candidate.revision) return draft(["candidate.trial_stale_revision"]);
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
  const paced = withLearnedPaces(structuredClone(stored.candidate.buildPlan), trial.learnedPaces ?? []);
  let adaptation: AutomationStudioBootstrapAdaptation;
  try {
    adaptation = await input.propose({ buildPlan: paced.buildPlan, baseDependencyDigest: stored.candidate.baseDependencyDigest, sourceInstructionIds: [...stored.sourceInstructionIds], summary: stored.candidate.summary,
      // The yes's first-ask fact rides on the `created` event's trial, which apply records on the saved Flow (header, t677).
      candidateTrial: { ...generated, trial: { ...generated.trial, start: trial.start.status, ...(trial.firstAskConfirmed !== undefined ? { firstAskConfirmed: trial.firstAskConfirmed } : {}) }, trials: input.trials.length,
        ...(trial.learnedPaces?.length ? { learnedPaces: trial.learnedPaces.map((pace) => ({ ...pace })) } : {}),
        ...(paced.raised.length ? { raisedPaces: paced.raised } : {}) } });
  } catch (error) {
    // The base moved under the adaptation lock: the draft stays, saying so. Anything else is not a refusal of this candidate.
    if (error instanceof Error && error.message.startsWith("FLOW_BOOTSTRAP_STALE")) return draft(["FLOW_BOOTSTRAP_STALE"]);
    throw error;
  }
  return { status: "proposed", adaptation, candidate: generated };
}

/** The ending codes a build set beside its standing trial's own code (`feedback.endingCodes`, t608): identifiers only, at most four. */
function endingCodes(standing: AutomationStudioCandidateTrialResult | undefined): string[] {
  const codes = standing?.feedback.endingCodes;
  return Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string" && /^[a-z0-9_.]{1,80}$/u.test(code)).slice(0, 4) : [];
}

/**
 * The plan with each node a trial learned a pace for raised to the larger of
 * its authored and learned pace, in the plan and in its laid-out copy alike,
 * and what was raised, for the audit. A learned pace that is not a positive
 * whole number is passed over; one past the plan's bound is held to it.
 */
function withLearnedPaces(buildPlan: AutomationStudioFlowBuildPlan, learnedPaces: readonly { subflowKey: string; nodeKey: string; paceMs: number }[]): {
  buildPlan: AutomationStudioFlowBuildPlan;
  raised: JsonObject[];
} {
  const learned = new Map<string, number>();
  for (const pace of learnedPaces) {
    if (!Number.isSafeInteger(pace.paceMs) || pace.paceMs < AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS.minPaceMs) continue;
    const key = JSON.stringify([pace.subflowKey, pace.nodeKey]);
    learned.set(key, Math.max(learned.get(key) ?? 0, Math.min(pace.paceMs, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS.maxPaceMs)));
  }
  if (!learned.size) return { buildPlan, raised: [] };
  const raised: JsonObject[] = [];
  const raise = <Node extends AutomationStudioFlowBootstrapNode>(subflowKey: string, node: Node, record: boolean): Node => {
    const pace = learned.get(JSON.stringify([subflowKey, node.key]));
    if (pace === undefined || pace <= (node.paceMs ?? 0)) return node;
    if (record) raised.push({ subflowKey, nodeKey: node.key, ...(node.paceMs === undefined ? {} : { authoredMs: node.paceMs }), paceMs: pace });
    return { ...node, paceMs: pace };
  };
  return {
    buildPlan: {
      ...buildPlan,
      plan: { ...buildPlan.plan, subflows: buildPlan.plan.subflows.map((subflow) => ({ ...subflow, nodes: subflow.nodes.map((node) => raise(subflow.key, node, true)) })) },
      subflows: buildPlan.subflows.map((subflow) => ({ ...subflow, nodes: subflow.nodes.map((node) => raise(subflow.key, node, false)) }))
    },
    raised
  };
}
