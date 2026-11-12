// What a Flow run needs, and nothing else of the attempt, so it can be tested alone and the
// driver can adapt its own state (`../attempt/state.ts`). Every member is read when it is needed.

import type { AutomationStudioFlowArtifact, AutomationStudioPublishedFlowSnapshot } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioDomainReadings } from "../../../../../runtime/domain-readings/index.ts";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../attempt/index.ts";
import type { AutomationStudioAnswerFirstRowSink } from "../rows/index.ts";

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
  permissions: Pick<AutomationStudioFlowBootstrapActionPermissions, "planStep" | "shown"> & { exploredToggles?: Pick<AutomationStudioFlowBootstrapActionPermissions["exploredToggles"], "trial"> | undefined };
  /** One call really reached the target. */
  stepped(): void;
  /** The run moved the page, so the attempt carries on from where it left it. */
  arrived(): void;
  /** Called inside the run's own care, so a service with no engine reads as a run that could not start. */
  engine(): AutomationStudioAnswerFirstFlowRunEngine;
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
