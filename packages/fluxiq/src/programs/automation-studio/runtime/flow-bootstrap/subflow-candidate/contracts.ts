import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapInterface, AutomationStudioFlowBootstrapSubflow, AutomationStudioFlowBootstrapSubflowMetadata } from "../plan/index.ts";
import type { AutomationStudioCandidateTrialAct, AutomationStudioCandidateTrialVerdict } from "../candidate/index.ts";

// What a subflow builder works within, what it submits and how its own subflow
// is tried (automation-project-agents-plan.md, `Scoped submission`, `Subflow
// trial`). A builder is the candidate authoring loop scoped to one subflow of
// the supervisor's structure plan. Plain fields only, so these do not wait on
// the project-agents contracts; the dispatcher maps a brief onto them.

/** One task-spec part the subflow covers: a verbatim span of an active instruction source. */
export type AutomationStudioSubflowScopePart = {
  partId: string;
  sourceId: string;
  text: string;
  /**
   * The lasting acts the task spec files under this part, when the dispatcher
   * carries them: a submission of a brief whose parts ask for one and that
   * declares none is refused (`./scoped-submission.ts`, t594). Absent, nothing
   * is asked of it.
   */
  lastingActs?: readonly string[];
};

/**
 * The brief's scope. `interface` and `successCheck` are the plan's for this
 * subflow, exactly as the plan holds them; a proposal must carry them
 * unchanged. `predecessors` are the subflow keys whose latest proposals run,
 * in order, to reach this subflow's entry.
 */
export type AutomationStudioSubflowScope = {
  buildId: string;
  briefId: string;
  planDigest: string;
  subflowKey: string;
  parts: readonly AutomationStudioSubflowScopePart[];
  interface?: AutomationStudioFlowBootstrapInterface;
  successCheck?: AutomationStudioFlowBootstrapSubflowMetadata["fluxiq.successCheck"];
  predecessors: readonly string[];
};

/** What binds a proposal, a trial and its receipt to one brief of one plan. */
export type AutomationStudioSubflowScopeIdentity = Pick<AutomationStudioSubflowScope, "buildId" | "briefId" | "planDigest" | "subflowKey">;

/**
 * A scoped submission receipt: the brief's subflow and the `part` helpers it
 * owns, target first. Its digest binds the scope identity, so two briefs never
 * produce matching receipts and an amended plan invalidates it. It grants
 * neither execution nor promotion.
 */
export type AutomationStudioSubflowProposal = {
  scope: AutomationStudioSubflowScopeIdentity;
  revision: number;
  digest: string;
  subflows: readonly AutomationStudioFlowBootstrapSubflow[];
  summary: string;
  changedPaths: readonly string[];
};

/**
 * One partial trial: prepare the scope's entry (undo the build's own acts,
 * then run the predecessors' latest proposals), run the proposal's subflow with
 * its interface inputs, and judge the scope's parts and success check.
 */
export type AutomationStudioSubflowTrialRequest = {
  scope: AutomationStudioSubflowScope;
  proposal: Readonly<AutomationStudioSubflowProposal>;
  signal: AbortSignal;
  /** What of this build was already on the site when the trial began; absent when the site was as the build found it. */
  startedWith?: readonly string[];
};

/**
 * A partial receipt. `partial: true` and `scope: "subflow"` keep it apart from
 * a whole candidate's trial result by type: it informs the builder and the
 * supervisor and never satisfies the whole-candidate trial gate.
 */
export type AutomationStudioSubflowTrialResult = {
  partial: true;
  scope: "subflow";
  identity: AutomationStudioSubflowScopeIdentity;
  revision: number;
  digest: string;
  verdict: AutomationStudioCandidateTrialVerdict;
  /** Bounded JSON for the model: what the trial did and why the verdict. */
  feedback: JsonObject;
  trialRunId?: string;
  /** Whether every predecessor ran to its end, so the target started from its prepared entry. */
  entryPrepared: boolean;
  /** Lasting acts that landed, predecessors' included, whatever the verdict. */
  acts?: AutomationStudioCandidateTrialAct[];
};

/** Runs one partial trial; injected by the service that owns execution and judging. */
export type AutomationStudioSubflowTrialPort = (request: AutomationStudioSubflowTrialRequest) => Promise<AutomationStudioSubflowTrialResult>;
