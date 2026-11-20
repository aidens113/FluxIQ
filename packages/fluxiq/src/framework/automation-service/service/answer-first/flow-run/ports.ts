// What a Flow run needs, and nothing else of the attempt, so it can be tested alone and the
// driver can adapt its own state (`../attempt/state.ts`). Every member is read when it is needed.

import type { AutomationStudioGraphInputUseSession, AutomationStudioInputUseObservation } from "../../../../../engine/automation/input-use/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioInputUseEntry } from "../../input-basis/index.ts";
import type { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioDomainReadings } from "../../../../../runtime/domain-readings/index.ts";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../attempt/index.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "../result-feed/index.ts";
import type { AutomationStudioAnswerFirstRowSink } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstSourceAuthority } from "./source-authority.ts";

/** What the engine runs a Flow with: the parts a trial's environment holds (`../../trial-ports/environment.ts`). */
export type AutomationStudioAnswerFirstFlowRunEngine = {
  parentFlow(): Promise<AutomationStudioFlowArtifact>;
  currentBaseDigest(): Promise<string>;
  snapshots(): Promise<AutomationStudioPublishedFlowSnapshot[]>;
  deprecatedPublicationIds(): Promise<string[]>;
  /** The options every run of a Flow gets, built where they are built (`../../runtime-session/graph-options.ts`). */
  graphOptions(input: { runId: string; signal: AbortSignal }): AutomationStudioGraphExecutionOptions;
  domainReadings?: AutomationStudioDomainReadings | undefined;
  /** The node definitions the run gate reads a Core node's output through (`../run-acts/run-gate.ts`). */
  definitions?: (() => ReadonlyArray<{ id: string; outputAction?: { fixedOutputId?: string; allowedOutputIds?: string[] } }>) | undefined;
};

export type AutomationStudioAnswerFirstFlowRunPorts = {
  /** `caller`, where a caller drove the attempt: its `inputs` are the run's inputs (`./input-bound-steps.ts`). */
  input: Pick<AutomationStudioAnswerFirstAttemptInput, "projectId" | "flowId" | "registry" | "resolution" | "binding" | "instructionText" | "instructionIds" | "startLocation" | "caller" | "humanness"> & {
    size?: AutomationStudioAnswerFirstAttemptInput["size"];
    routing: Pick<AutomationStudioAnswerFirstAttemptInput["routing"], "signaturesOf">;
    cancellation: Pick<AutomationStudioAnswerFirstAttemptInput["cancellation"], "signal">;
  };
  /**
   * The task's own humanness level as it is stored (`../task-memory/memory.ts`), where it has one. The run's level is then
   * resolved by precedence: the caller's `humanness`, this, the run Flow's `metadata.humanness`, the request's starting value
   * (`input.humanness`), and with none of them no level at all (`./flow-run.ts`).
   */
  storedHumanness?: { task?: number | undefined } | undefined;
  /** The attempt's run: the rows the sink holds are stored under it. */
  runId: string;
  record: AutomationStudioAttemptActRecord;
  sink: Pick<AutomationStudioAnswerFirstRowSink, "recordBatch">;
  /** The attempt's one result: told the run's batches as its draft steps' pages once it has ended (`./flow-run.ts`). Absent, nothing is told. */
  result?: Pick<AutomationStudioAnswerFirstResultFeed, "batches"> | undefined;
  permissions: Pick<AutomationStudioFlowBootstrapActionPermissions, "planStep" | "shown"> & { exploredToggles?: Pick<AutomationStudioFlowBootstrapActionPermissions["exploredToggles"], "trial"> | undefined };
  /** One call really reached the target. */
  stepped(): void;
  /** The run moved the page, so the attempt carries on from where it left it. */
  arrived(): void;
  /**
   * Where what the run did goes for the attempt's judge (t963): every step the engine traced, in order, with what it
   * ran with, what it answered and the domain's view after it, by the domain's declared view keys (`./flow-run.ts`).
   * Absent, nothing is handed on.
   */
  trail?: { viewKeys?: readonly string[] | undefined; add(steps: readonly AutomationStudioResultTrailStep[]): void } | undefined;
  /** Called inside the run's own care, so a service with no engine reads as a run that could not start. */
  engine(): AutomationStudioAnswerFirstFlowRunEngine;
  /** Current persisted candidate/original-source authority. Absent legacy owners still run, with unknown identity. */
  sourceAuthority?: AutomationStudioAnswerFirstSourceAuthority | undefined;
  /**
   * Graph-entry input evidence (`../../input-basis/execution/`), where this port's owner opted in: `open` gives one
   * explicit session over the layers this run actually assembled, under the scope the owner resolved from its own
   * authenticated owners (`AutomationStudioInputUseExecutions.of(service).open`); `observed` is told the run's one closed observation, a
   * reference and location or an unknown code, never a value. Absent, the run is exactly as it was, with no evidence work.
   */
  inputUse?: {
    open(entry: AutomationStudioInputUseEntry): AutomationStudioGraphInputUseSession;
    observed(observation: AutomationStudioInputUseObservation): void;
  } | undefined;
  /**
   * Where a check only a person can clear is put to them, and `waiting` told while it stands
   * (`./person-check-port.ts`). Absent, nobody can be asked, and a step meeting one ends the run.
   */
  personCheck?: {
    port: AutomationStudioParkingPort;
    waiting(state: "started" | "ended", waitedMs: number): void;
    /** The person pressed Stop on the check: that is their Stop of the whole attempt, not a step's failure. */
    stopped?(): void;
  } | undefined;
};
