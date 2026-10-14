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
  /** The build's current structure plan digest; null once the build is gone. Absent, the scope's digest is taken as current. */
  currentPlanDigest?: ((buildId: string) => Promise<string | null>) | undefined;
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
