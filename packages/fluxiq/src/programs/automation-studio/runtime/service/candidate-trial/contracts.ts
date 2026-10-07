import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowRunActionAttemptRecord, AutomationStudioPublishedFlowSnapshot, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { runAutomationStudioDetachedCandidate } from "../../flow-bootstrap/verification/index.ts";
import type { AutomationStudioBuildTestJudgeInput, AutomationStudioBuildTestVerdict, AutomationStudioResultEndView, AutomationStudioResultRecordSetInput } from "../../result-verification/index.ts";

/**
 * The deployment's start hook (decision D1, 2026-10-07): puts the target back
 * to the candidate's declared start before each trial. The Lab points it at
 * its own fixture reset; a product deployment leaves it unset, and each trial
 * then records `not_reset`. What it answers is recorded with the trial and
 * never shown to the model.
 */
export type AutomationStudioPrepareCandidateStart = (input: {
  projectId: string;
  flowId: string;
  candidateId: string;
  revision: number;
  digest: string;
  startLocation?: string;
  signal: AbortSignal;
}) => Promise<JsonObject>;

/** How the trial's start was prepared. */
export type AutomationStudioCandidateTrialStart =
  | { status: "reset"; result: JsonObject }
  | { status: "not_reset" }
  | { status: "failed"; code: string; failure: string };

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
  judge: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };
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
  /** The build-test judge (`automationStudioBuildTestJudge`), bound to the build's provider, instructions and signal. */
  judge(input: AutomationStudioBuildTestJudgeInput): Promise<AutomationStudioBuildTestVerdict>;
  /** The detached runner; replaced only by tests. */
  execute?: typeof runAutomationStudioDetachedCandidate | undefined;
  now?: (() => number) | undefined;
  newRunId?: (() => string) | undefined;
};
