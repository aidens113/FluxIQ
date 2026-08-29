import type { ProgramCommandTransport } from "../data/program-transport";

export const RUNTIME_RUN_PAGE_SIZE = 25;
export const RUNTIME_ACTION_PAGE_SIZE = 50;
export const RUNTIME_EVENT_PAGE_SIZE = 100;

export type RunHistoryQuery = {
  status: string;
  search: string;
  sort: "updated" | "started" | "duration" | "actions" | "status";
  direction: "asc" | "desc";
  limit: number;
};

export function listRuntimeRuns(api: ProgramCommandTransport, payload: Record<string, any>) {
  return api.post<{ runs?: any[]; page?: { runs?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-runs", payload);
}

export async function getRuntimeFlowReadiness(api: ProgramCommandTransport, payload: { projectId: string; flowId: string }) {
  const [instructions, router, subflows] = await Promise.all([
    api.post<{ instructions?: any[] }>("get-flow-instruction-set", payload),
    api.post<{ router?: any }>("get-flow-router", payload),
    api.post<{ page?: { total?: number } }>("list-flow-subflows", { ...payload, limit: 1, offset: 0, status: "active" })
  ]);
  const error = [instructions, router, subflows].find((result) => !result.ok)?.error ?? "";
  return {
    error,
    instructions: instructions.payload?.instructions ?? [],
    router: router.payload?.router ?? null,
    subflowTotal: subflows.payload?.page?.total ?? 0
  };
}

export function listRuntimeRunActions(api: ProgramCommandTransport, payload: { projectId: string; runId: string; limit: number; offset: number }) {
  return api.post<{ actions?: any[]; page?: { actions?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-run-actions", payload);
}

export function getRuntimeRunDetail(api: ProgramCommandTransport, payload: { projectId: string; runId: string; compact: true }) {
  return api.post<{ runDetail?: any }>("get-flow-run-detail", payload);
}

export function listRuntimeRunEvents(api: ProgramCommandTransport, payload: { projectId: string; runId: string; afterSequence: number; limit: number }) {
  return api.post<{ events?: any[]; page?: { events?: any[]; nextCursor?: string | null; hasMore?: boolean; lastSequence?: number } }>("list-flow-run-events", payload);
}