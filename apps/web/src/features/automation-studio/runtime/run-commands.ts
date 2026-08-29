import type { ProgramCommandTransport } from "../data/program-transport";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";


export function startRuntimeSession(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ runtimeSession?: any }>("start-runtime-session", payload);
}

export function executeRuntimeSession(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ runtimeSession?: any; runSummary?: any; createdAdaptationIds?: string[]; interventionCount?: number; terminalReason?: string; durableBehaviorChanged?: boolean }>("run-runtime-session", payload);
}

export function cancelRuntimeSession(api: ProgramCommandTransport, payload: { projectId: string; runId: string }) {
  return api.post("cancel-runtime-session", payload);
}

export function commitRuntimeRunChanged(detail: { projectId: string | null; flowId?: string; runId: string }): void {
  commitAutomationStudioMutation({ kind: "runtime-run.changed", ...detail });
}

export function exportRuntimeRunAudit(api: ProgramCommandTransport, payload: { projectId: string; runId: string }) {
  return api.post<{ audit?: any }>("export-flow-run-audit", payload);
}