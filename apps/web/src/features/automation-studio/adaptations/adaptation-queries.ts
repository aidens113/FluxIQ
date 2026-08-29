import type { ProgramCommandTransport } from "../data/program-transport";
export function listFlowAdaptations(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ adaptations?: any[]; page?: { adaptations?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-adaptations", payload); }
export function getFlowAdaptation(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ adaptation?: any }>("get-flow-adaptation", payload); }
