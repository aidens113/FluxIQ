import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioPublishedFlowSnapshot, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioRunEnvironment } from "../../environment/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { runAutomationStudioDetachedCandidate } from "../../flow-bootstrap/verification/index.ts";
import type { AutomationStudioHostResourceLease } from "../../project-agents/host-resources/index.ts";
import type { AutomationStudioBuildTestJudgeInput, AutomationStudioBuildTestVerdict, AutomationStudioResultEndView, AutomationStudioResultRecordSetInput, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";

/**
 * The deployment's start hook (decision D1, 2026-10-07): puts the target back
 * to the candidate's declared start before each trial. The Lab points it at
 * its own fixture reset; a product deployment leaves it unset, and each trial
 * then records `not_reset`. What it answers is recorded with the trial and
 * never shown to the model.
 *
 * **Under a host lease it resets only the leased resource** (automation-project-
 * agents plan, A11). When the trial runs for an agent that holds a host-resource
 * lease (`project-agents/host-resources/lease-scope.ts`), `lease` is that lease,
 * and the hook must put back only the resource `lease.resourceKey` names (on the
 * gateway session `lease.sessionId` names, when set) and nothing another holder
 * may be using: above capacity 1 two agents hold separate resources at once, and
 * a reset that reached past its own would undo the other's acts. A lease that is
 * no longer current never reaches the hook: the trial's start fails first
 * (`./run.ts`, `automationStudioCandidateTrialStart`). Without a lease -- an
 * ordinary candidate build, or a host that leases nothing -- `lease` is absent
 * and the hook resets as it always has.
 */
export type AutomationStudioPrepareCandidateStart = (input: {
  projectId: string;
  flowId: string;
  candidateId: string;
  revision: number;
  digest: string;
  startLocation?: string;
  /** The host-resource lease the trial runs under, when it runs under one; the hook resets only that resource (above). */
  lease?: AutomationStudioHostResourceLease;
  signal: AbortSignal;
}) => Promise<JsonObject>;

/** How the trial's start was prepared. */
export type AutomationStudioCandidateTrialStart =
  | { status: "reset"; result: JsonObject }
  | { status: "not_reset" }
  | { status: "failed"; code: string; failure: string };

/** A pace a trial learned for one node of the candidate plan, in milliseconds between two starts of it. */
export type AutomationStudioCandidateTrialLearnedPace = { subflowKey: string; nodeKey: string; paceMs: number };

/** One trial as Core keeps it: the audit record behind the verdict the model was given. */
export type AutomationStudioCandidateTrialRecord = {
  candidateId: string;
  revision: number;
  digest: string;
  /** The trial's own runtime session; absent when the start hook failed before one opened. */
  trialRunId?: string;
  start: AutomationStudioCandidateTrialStart;
  execution: "succeeded" | "failed" | "cancelled" | "not_run";
  verdict: AutomationStudioCandidateTrialVerdict;
  /** Why the trial was not judged yes, as a code; absent on a yes. */
  code?: string;
  /**
   * The paces the trial's run learned from failures that asked it to wait
   * (`trace.pace`, executor `pacing/`), by the candidate plan's own subflow and
   * node keys, so a promotion of this trial can keep them. Absent when it
   * learned none.
   */
  learnedPaces?: AutomationStudioCandidateTrialLearnedPace[];
  /**
   * True when this record is the judge asked again about an earlier trial it
   * did not judge, on that trial's evidence and under its run id; nothing ran
   * (`./run.ts`, t473).
   */
  judgedAgain?: true;
  /**
   * On a yes only: whether the judge's yes was reached by its first two calls
   * with nothing re-asked of a different verdict (`firstAskConfirmed` on the
   * build-test judge's yes, `../../result-verification/first-ask/`, t677).
   * Promotion carries it to the saved Flow's judged trial, which the playback
   * hold reads in place of `judge.calls`. Absent where the judge did not say.
   */
  firstAskConfirmed?: boolean;
  judge: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };
};

/**
 * A trial its judge did not judge, kept whole so the judge can be asked again
 * on it rather than the Flow run again (`./run.ts`, t473): the summary the
 * judge was shown, what its feedback reads beside it, and the record's start
 * and paces.
 */
export type AutomationStudioCandidateTrialUnjudged = {
  summary: AutomationStudioRunResultSummary;
  shown: { trialRunId: string; trace?: AutomationStudioGraphExecutionTrace | undefined; graph?: AutomationStudioFlowArtifact | undefined; start: string; wayOuts?: Readonly<Record<string, string>> };
  start: AutomationStudioCandidateTrialStart;
  learnedPaces?: AutomationStudioCandidateTrialLearnedPace[];
};

/** What a trial reaches outside itself. Every read is the trial's own: nothing here sees the build's exploration. */
export type AutomationStudioCandidateTrialPorts = {
  projectId: string;
  flowId: string;
  sourceInstructionIds: readonly string[];
  startLocation?: string | undefined;
  registry?: AutomationStudioNodeRegistry | undefined;
  resolution: AutomationStudioNodeRegistryResolution;
  parentFlow(): Promise<AutomationStudioFlowArtifact>;
  /** The Flow's dependency digest now; a trial whose base moved is not run. */
  currentBaseDigest(): Promise<string>;
  snapshots(): Promise<AutomationStudioPublishedFlowSnapshot[]>;
  deprecatedPublicationIds(): Promise<string[]>;
  /** Opens the trial's runtime session (`runtime_runs`), so its rows can be stored under its run id. */
  openSession(input: { runId: string; metadata: JsonObject }): Promise<AutomationStudioRuntimeSession>;
  writeSession(session: AutomationStudioRuntimeSession): Promise<unknown>;
  /** The executor options a normal run of this Flow gets (`../runtime-session/graph-options.ts`), for this trial's run id. */
  graphOptions(input: { runId: string; signal: AbortSignal }): AutomationStudioGraphExecutionOptions;
  processDatasets(runId: string): Promise<void>;
  recordSets(runId: string): Promise<AutomationStudioResultRecordSetInput[]>;
  readEndView?: ((input: { runId: string }) => Promise<AutomationStudioResultEndView | undefined>) | undefined;
  actionAttempts?: ((session: AutomationStudioRuntimeSession) => readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined) | undefined;
  observedStateKeys?: readonly string[] | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
  prepareStart?: AutomationStudioPrepareCandidateStart | undefined;
  /**
   * The handle the model can name each way out the trial's run pressed by, from
   * the bound domain (`clearedControlHandles`, t470), keyed by the client's
   * `wayOut` reference. Absent, or a reference left out, names no handle.
   */
  clearedControlHandles?: ((wayOuts: readonly string[]) => Promise<Readonly<Record<string, string>>>) | undefined;
  /** The build-test judge (`automationStudioBuildTestJudge`), bound to the build's provider, instructions and signal. */
  judge(input: AutomationStudioBuildTestJudgeInput): Promise<AutomationStudioBuildTestVerdict>;
  /** The detached runner; replaced only by tests. */
  execute?: typeof runAutomationStudioDetachedCandidate | undefined;
  /**
   * Where the trial's world comes from (traces and offline trials, U7): its
   * clock, run ids and the client channel its work runs on. Absent, the live
   * environment, which is today's fallbacks. `now` and `newRunId` below, when
   * given, still win over it.
   */
  environment?: AutomationStudioRunEnvironment | undefined;
  now?: (() => number) | undefined;
  newRunId?: (() => string) | undefined;
};

/**
 * One step a trial ran, its retries folded in (`./executed-steps.ts`): the
 * step's final attempt, how many it took, the failed attempts it was tried
 * again after, and the loop pass it ran in.
 */
export type AutomationStudioTrialExecutedStep = {
  attempt: AutomationStudioNodeAttemptTrace;
  attempts: number;
  /** Each failed attempt the step was tried again after, with the attempt that followed it. */
  absorbed: Array<{ failed: AutomationStudioNodeAttemptTrace; retry: AutomationStudioNodeAttemptTrace }>;
  /** The outputs of the loop pass the step ran in, when it ran in one. */
  pass?: AutomationStudioNodeAttemptTrace["outputs"] | undefined;
};
