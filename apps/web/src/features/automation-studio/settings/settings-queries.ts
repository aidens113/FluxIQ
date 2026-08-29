import type { ProgramCommandTransport } from "../data/program-transport";
export function listFlowPublications(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ publications?: any[] }>("list-flow-publications", payload); }
export function loadSubflowSettingsResources(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; subflowId: string }) {
  return Promise.all([
    api.post<{ subflow?: any }>("get-flow-subflow", payload),
    api.post<{ flow?: any }>("get-flow", { projectId: payload.projectId, flowId: payload.flowId }),
    api.post<{ instructions?: any[] }>("list-flow-instructions", { projectId: payload.projectId, flowId: payload.flowId, limit: 50, offset: 0, sort: "title", direction: "asc" }),
    api.post<{ router?: any }>("get-flow-router", { projectId: payload.projectId, flowId: payload.flowId })
  ]);
}
