import type { ProgramCommandTransport } from "../data/program-transport";
export function getSubflowDirectoryRouter(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("get-flow-router", payload); }
export function listFlowSubflows(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ subflows?: any[]; page?: { subflows?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-subflows", payload); }
