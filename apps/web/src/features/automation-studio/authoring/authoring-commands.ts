import type { ProgramCommandTransport } from "../data/program-transport";

export function generateFlowBootstrapAdaptation(api: ProgramCommandTransport, payload: { projectId: string; flowId: string; llmExecutionGrantId: string }) {
  return api.post<{ adaptation?: { projectId?: string; flowId?: string; adaptationId?: string; status?: string } }>("generate-flow-bootstrap-adaptation", payload);
}
