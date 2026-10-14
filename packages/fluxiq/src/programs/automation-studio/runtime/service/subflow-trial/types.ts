import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowProposal, AutomationStudioSubflowScope, AutomationStudioSubflowScopeIdentity } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { runAutomationStudioDetachedSubflow } from "../../flow-bootstrap/verification/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord, AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";

/**
 * What the scoped judge is shown: the partial trial's own summary and the
 * brief's scope -- its parts, as verbatim spans of the instructions, and the
 * subflow's success check. It judges the parts, never the whole task.
 */
export type AutomationStudioSubflowTrialJudgeInput = {
  summary: AutomationStudioRunResultSummary;
  scope: AutomationStudioSubflowScope;
  /**
   * The success check the trial is judged against, and whose it is: the
   * scope's -- the structure plan's -- or, where the plan gives none (the plan
   * the project supervisor writes; t569), the one the tried proposal carries,
   * which its builder proposed. Absent when neither has one.
   */
  successCheck?: { check: NonNullable<AutomationStudioSubflowScope["successCheck"]>; from: "plan" | "builder" } | undefined;
};

/**
 * What a partial trial reaches outside itself. Everything a whole candidate's
 * trial reaches (`../candidate-trial/contracts.ts`), except that its judge is
 * the scoped one and its runner the partial one, plus the predecessors'
 * latest proposals, which the dispatcher owns.
 */
export type AutomationStudioSubflowTrialPorts = Omit<AutomationStudioCandidateTrialPorts, "judge" | "execute"> & {
  /**
   * The latest proposal of each Subflow `scope.predecessors` names, in that
   * order. Asked before the trial runs and again at every child load, so a
   * predecessor proposal replaced mid-trial stops it.
   */
  predecessorProposals(scope: AutomationStudioSubflowScope): Promise<readonly AutomationStudioSubflowProposal[]>;
  /**
   * Whether an amendment kept a predecessor's proposal made under an earlier plan (t590: it left that subflow as it
   * was), so the trial may still run it. Absent, only a proposal made under the scope's own plan counts.
   */
  keptUnder?: ((subflowKey: string, madeUnder: string, planDigest: string) => boolean) | undefined;
  /** The build's current structure plan digest; null once the build is gone. Absent, the scope's digest is taken as current. */
  currentPlanDigest?: ((buildId: string) => Promise<string | null>) | undefined;
  /**
   * The bound domain's arrival node and the parameter it takes a location
   * under (`runsNodes.arrival`, t578). With `startLocation`, every trial's run
   * goes to the start location first, after the start hook and before any
   * predecessor, so it starts on a loaded start page rather than on the page
   * a builder left (`./run.ts`). Absent, the run starts where the tab stands.
   */
  arrival?: { node: string; parameter: string } | undefined;
  judge(input: AutomationStudioSubflowTrialJudgeInput): Promise<AutomationStudioBuildTestVerdict>;
  /** The partial runner; replaced only by tests. */
  execute?: typeof runAutomationStudioDetachedSubflow | undefined;
};

/** One partial trial as Core keeps it, for the build record and its accounting. */
export type AutomationStudioSubflowTrialRecord = {
  identity: AutomationStudioSubflowScopeIdentity;
  revision: number;
  digest: string;
  /** The trial's own runtime session; absent when nothing ran. */
  trialRunId?: string;
  start: AutomationStudioCandidateTrialStart | { status: "not_run" };
  execution: "succeeded" | "failed" | "cancelled" | "not_run";
  entryPrepared: boolean;
  failedPredecessor?: string;
  verdict: AutomationStudioCandidateTrialVerdict;
  code?: string;
  judge: AutomationStudioCandidateTrialRecord["judge"];
};
