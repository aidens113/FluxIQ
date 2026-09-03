import type { ProgramCommandTransport } from "../data/program-transport";
export function listFlowPublications(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ publications?: any[] }>("list-flow-publications", payload); }
export function loadFlowSettingsDetail(api: ProgramCommandTransport, payload: { projectId: string; flowId: string }) {
  return api.post<{ flow?: any }>("get-flow-metadata-detail", payload);
}
export function loadSubflowSettingsResources(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; subflowId: string }) {
  return Promise.all([
    settledPost(api.post<{ subflow?: any }>("get-flow-subflow", payload), "Subflow settings"),
    settledPost(api.post<{ flow?: any }>("get-flow-metadata-detail", { projectId: payload.projectId, flowId: payload.flowId }), "Parent Flow"),
    settledPost(api.post<{ instructions?: any[] }>("list-flow-instructions", { projectId: payload.projectId, flowId: payload.flowId, limit: 50, offset: 0, sort: "title", direction: "asc" }), "Flow instructions"),
    settledPost(api.post<{ targets?: any[]; batch?: { targets?: any[]; perTargetLimit?: number } }>("list-flow-router-target-references", { projectId: payload.projectId, flowId: payload.flowId, subflowIds: [payload.subflowId], perTargetLimit: 50 }), "Router references")
  ]);
}

async function settledPost<T>(request: Promise<{ ok: boolean; payload?: T; error?: string }>, label: string) {
  try {
    return await request;
  } catch (error) {
    return { ok: false as const, error: `${label} could not be loaded: ${error instanceof Error ? error.message : String(error)}` };
  }
}
