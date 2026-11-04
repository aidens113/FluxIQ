// What a run of a saved part is asked with, what it reaches of the service, and what
// it answers. Nothing here is a Flow: a part run names a part, and its session names
// a root made for it.
import type { AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import type { RunProjectPartRefusal, RunProjectPartRequest, RunProjectPartResponse } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioRunControlGate } from "../../../../../runtime/automation-host/index.ts";
import type { AutomationStudioPartCaller } from "../../../../../runtime/project-parts/index.ts";
import type { AutomationStudioCandidateTrialLandedAct } from "../../candidate-trial/index.ts";
import type { AutomationStudioServiceTrialCollaborators } from "../../trial-ports/index.ts";
import type { AutomationStudioProjectPartDrivingPorts } from "./driving-gate.ts";
import type { ProjectPartSettled } from "./settled-calls.ts";

/** A run as the service holds it: where a person pauses and stops it, closed when the run ends. */
export type AutomationStudioProjectPartOpenRun = { gate: AutomationStudioRunControlGate; close(): void };

/** What a part run reaches of the service, each read when a run asks for it. */
export type AutomationStudioProjectPartRunPorts = {
  /** The executor's parts, sessions, datasets and catalogue every run of the service is made from. */
  collaborators(): Pick<AutomationStudioServiceTrialCollaborators, "catalogue" | "writeRuntimeSession" | "executor" | "runDatasets" | "conversations"> | undefined;
  /** Registers the run so a person can pause and stop it as they can any other. */
  openRun(projectId: string, runId: string, abort: AbortController): AutomationStudioProjectPartOpenRun;
  getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  /** Who else is running in the project (`./driving-gate.ts`). */
  driving: AutomationStudioProjectPartDrivingPorts;
};

/**
 * One run. A person's run is checked by a gate of its own over `permittedConsequences`; a
 * build's passes the build's own check as `permission`, so a lasting step is put to the gate
 * `core.run_node` uses, and `refuseRepeat` names the acts its ledger already holds.
 */
export type AutomationStudioProjectPartRunInput = RunProjectPartRequest & {
  caller: AutomationStudioPartCaller;
  signal?: AbortSignal | undefined;
  permission?: AutomationStudioActionPermissionCheck | undefined;
  /** Whether this very run was already done in this build: a lasting one is then refused, never repeated. */
  repeated?: ((key: { partId: string; version: number }) => boolean) | undefined;
  /** Told each lasting step's call and what became of it, as it happens (`./settled-calls.ts`). */
  settled?: ProjectPartSettled | undefined;
};

/** A part that was not run, as the library answers it. The handler turns it into `RunProjectPartRefusal`. */
export type AutomationStudioProjectPartRunRefusal = {
  ok: false;
  code: RunProjectPartRefusal["code"];
  message: string;
  /** Which bound a part's calls broke, where `code` is `part.calls_not_available` because of one. A stable word. */
  callBound?: "part.call_cycle" | "part.call_too_deep";
  classes?: AutomationStudioAttemptActClass[];
};

/** A part that ran: the answer, the acts its steps landed for a build's ledger, and the version that ran. */
export type AutomationStudioProjectPartRunResult = {
  response: RunProjectPartResponse;
  landedActs: readonly AutomationStudioCandidateTrialLandedAct[];
  partId: string;
  version: number;
};
