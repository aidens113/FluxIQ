import type { ProgramCommandTransport } from "../data/program-transport";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";


export function startRuntimeSession(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ runtimeSession?: any }>("start-runtime-session", payload);
}

export function executeRuntimeSession(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ runtimeSession?: any; runSummary?: any; createdAdaptationIds?: string[]; interventionCount?: number; terminalReason?: string; durableBehaviorChanged?: boolean }>("run-runtime-session", payload);
}
export function preflightLlmExecution(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ preflight?: any }>("preflight-llm-execution", payload);
}

export function issueLlmExecutionGrant(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ grant?: { grantId?: string } }>("issue-llm-execution-grant", payload);
}

export function cancelRuntimeSession(api: ProgramCommandTransport, payload: { projectId: string; runId: string }) {
  return api.post("cancel-runtime-session", payload);
}

/**
 * What Core's run-control endpoints answer: whether the run is executing and
 * can be held (`live`), its control as it stands, and the one progress status a
 * person is shown. `runControl` and `progress` are Core's shapes, read loosely
 * here the way the rest of this panel reads a runtime session.
 */
export type RuntimeRunControlAnswer = {
  runId: string;
  sessionStatus: string | null;
  live: boolean;
  runControl: { state: "running" | "pause_requested" | "paused"; holder: "fluxiq" | "person" | null; nodeId?: string; expiresAt?: number; reason?: string } | null;
  progress: { status: string; label: string; detail?: string } | null;
};

/** Holds a run between two steps. `takeControl` hands the page to the person as well. */
export function pauseRuntimeSession(api: ProgramCommandTransport, payload: { projectId: string; runId: string; takeControl?: boolean; reason?: string }) {
  return api.post<RuntimeRunControlAnswer>("pause-runtime-session", payload);
}

/** Lets a held run go on from the node it held before. `afterManualAction` records that the person acted on the page. */
export function resumeRuntimeSession(api: ProgramCommandTransport, payload: { projectId: string; runId: string; afterManualAction?: boolean; note?: string }) {
  return api.post<RuntimeRunControlAnswer>("resume-runtime-session", payload);
}

/** Reads a run's control and progress without changing either. */
export function getRuntimeRunControl(api: ProgramCommandTransport, payload: { projectId: string; runId: string }) {
  return api.post<RuntimeRunControlAnswer>("get-runtime-run-control", payload);
}

export function commitRuntimeRunChanged(detail: { projectId: string | null; flowId?: string; runId: string }): void {
  commitAutomationStudioMutation({ kind: "runtime-run.changed", ...detail });
}

export function exportRuntimeRunAudit(api: ProgramCommandTransport, payload: { projectId: string; runId: string }) {
  return api.post<{ audit?: any }>("export-flow-run-audit", payload);
}