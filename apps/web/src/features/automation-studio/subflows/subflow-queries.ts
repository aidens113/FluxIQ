import type { ProgramCommandTransport } from "../data/program-transport";
export function listSubflowRouterReferences(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ targets?: any[]; batch?: { targets?: any[]; perTargetLimit?: number } }>("list-flow-router-target-references", payload); }
export function listFlowSubflows(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ subflows?: any[]; page?: { subflows?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-subflows", payload); }
