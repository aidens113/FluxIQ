import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapInterface, AutomationStudioFlowBootstrapSubflow, AutomationStudioFlowBootstrapSubflowMetadata } from "../plan/index.ts";
import type { AutomationStudioCandidateTrialAct, AutomationStudioCandidateTrialVerdict } from "../candidate/index.ts";
import type { AutomationStudioSiteResetTrialActPlace } from "../site-reset/index.ts";
import type { AutomationStudioRunEnvironmentKind } from "../../environment/index.ts";
import type { AutomationStudioTrialOfflineFirst } from "../offline-first/index.ts";
import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeOutcome, AutomationStudioTrialPartEffect } from "../trial-change/index.ts";

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
  /**
   * The change the task spec says this part asks for (t775), when the dispatcher carries it: a trial is judged by it
   * (`../trial-change/`), and an end state another step of this build already made is undone first, just that act
   * (`candidate.trial_starts_in_end_state`). Absent, the part is judged from the run alone.
   */
  effect?: AutomationStudioTrialPartEffect;
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
  /**
   * The interface's inputs whose value an earlier subflow of the plan hands
   * on, by the rule assembly binds them by (`project-agents/dispatch/call-order.ts`,
   * t672). One no line reads is no refusal: the subflow did not need it
   * (`./callable-target.ts`). Every other input is a value the person gives
   * the Flow. Absent, every input is.
   */
  handedOn?: readonly string[];
  /**
   * The task spec's other parts, each another builder's subflow, by id and the
   * person's words, when the dispatcher carries them (t676): the builder is
   * told them, so a lasting act of one it does while exploring is known as
   * another builder's part, never a step of its own
   * (`./builder-loop.ts`). Absent, it is told only that other parts exist.
   */
  outOfScope?: readonly AutomationStudioSubflowOutOfScopePart[];
};

/** A part of the task another builder's subflow does (t676), by id and the person's words. */
export type AutomationStudioSubflowOutOfScopePart = { partId: string; text: string };

/**
 * What a dependent builder's blocked ending says a subflow before it did
 * (t676): one of its own parts, by id, and the act the run that prepared its
 * entry landed for it, where it names one. Core admits it only when the part
 * asks a lasting act and that act is the preparation run's
 * (`./builder-loop.ts`).
 */
export type AutomationStudioSubflowDoneBefore = { part: string; act?: string };

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
  /** The scope's handed-on inputs no line of this proposal reads (t672): the builder's answer and its brief's return say so, so no plan change follows. */
  unneededInputs?: readonly string[];
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
  /** Each earlier judged trial's advice for this subflow, oldest first, at most three, with whether this revision changed what it named (t752, `../candidate/earlier-advice-memory.ts`): the judge is told it, last in its summary. */
  earlierAdvice?: readonly import("../../result-verification/contracts/index.ts").AutomationStudioResultEarlierAdvice[];
  /**
   * What the live trial changed on the site (t775, `../candidate/contracts.ts` says the same of a whole trial): the port
   * calls it after its end view and before its judge with the trial's acts, and hands the judge `siteChange`. Absent for
   * an offline trial and where nothing of the change could be read.
   */
  siteChange?: (acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal) => Promise<AutomationStudioTrialChangeOutcome>;
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
  /** Lasting acts that landed, predecessors' included, whatever the verdict, each with where its step sat and what it made (L1). */
  acts?: Array<AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace>;
  /**
   * Set by a port whose answer came from the recording of this build's last
   * live test, nothing done on the site for it (trace plan P6, D48: the
   * single-subflow whole test the whole gate kept). The subflow trial gate
   * says and keeps it as it does its own kept answer.
   */
  checkedAgainst?: "recorded_run";
  /**
   * The plan key of the proposal's own step the trial stopped at, where it
   * stopped at one of them (t804): the step a failed test is repaired on, and
   * the step a from-step run must pass before the part is tested whole again.
   * Absent where the run ended, or stopped before or outside the proposal.
   */
  stoppedAtKey?: string;
};

/**
 * A from-step run (t804, the rule "build the whole Flow first; test it whole
 * only when it should work"): the proposal's subflow run from the step `fromKey`
 * names, on the page as it stands, with no start hook, site reset, arrival or
 * earlier subflows, and no judge. It checks a repair; it is never the part's
 * test and never satisfies a gate.
 */
export type AutomationStudioSubflowFromStepRequest = {
  scope: AutomationStudioSubflowScope;
  proposal: Readonly<AutomationStudioSubflowProposal>;
  /** The plan key of the proposal's step the run starts at. */
  fromKey: string;
  signal: AbortSignal;
};

/** What a from-step run did. `fromStep: true` keeps it apart from a trial result by type. */
export type AutomationStudioSubflowFromStepResult = {
  fromStep: true;
  identity: AutomationStudioSubflowScopeIdentity;
  revision: number;
  digest: string;
  fromKey: string;
  /** `ended`: it ran to the part's end; `stopped`: a step failed; `not_run`: it did not start (see `code`). */
  status: "ended" | "stopped" | "not_run";
  /** The plan keys of the proposal's steps that completed, in run order. */
  passedKeys: readonly string[];
  /** The plan key of the step it stopped at, where `status` is `stopped`. */
  stoppedAtKey?: string;
  /** Why it did not start or where it stopped, when it did not end. */
  code?: string;
  /** Bounded JSON for the model: the steps it ran and the stop. */
  feedback: JsonObject;
  trialRunId?: string;
  /** Lasting acts that landed, each with where its step sat and what it made. */
  acts?: Array<AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace>;
};

/** Runs one from-step run; injected beside the trial port by the service that owns execution. */
export type AutomationStudioSubflowFromStepPort = (request: AutomationStudioSubflowFromStepRequest) => Promise<AutomationStudioSubflowFromStepResult>;

/**
 * Runs one partial trial; injected by the service that owns execution and
 * judging. `environmentKind`, as on a whole candidate's port
 * (`AutomationStudioCandidateTrialPort`): set and not `live`, the trial is
 * offline, and the subflow trial gate runs no start hook or site reset for it
 * and never keeps its yes as the verdict that completes the brief.
 */
export type AutomationStudioSubflowTrialPort = ((request: AutomationStudioSubflowTrialRequest) => Promise<AutomationStudioSubflowTrialResult>) & {
  readonly environmentKind?: AutomationStudioRunEnvironmentKind | undefined;
  /**
   * Asked once per revision and digest, before any site action (trace plan P6,
   * `../offline-first/`): a failure the recording of this build's last live
   * test demonstrates is kept as the trial, with nothing done on the site;
   * anything else runs live in the same call. Absent, every trial is live.
   */
  readonly offlineFirst?: AutomationStudioTrialOfflineFirst<AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult> | undefined;
  /** Runs the latest proposal from one of its steps on the page as it stands (t804). Absent, a builder cannot run from a step, and the gate's from-step-first rule does not apply. */
  readonly fromStep?: AutomationStudioSubflowFromStepPort | undefined;
};
