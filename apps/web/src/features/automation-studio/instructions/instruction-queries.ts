import type { ProgramCommandTransport } from "../data/program-transport";
export function getInstructionScopeRouter(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("get-flow-router", payload); }
export function listInstructionScopeSubflows(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ subflows?: any[]; page?: { subflows?: any[] } }>("list-flow-subflows", payload); }
export function getFlowInstructionSet(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ instructions?: any[] }>("get-flow-instruction-set", payload); }
export function listFlowInstructions(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ instructions?: any[]; page?: { instructions?: any[]; total?: number; limit?: number; offset?: number } }>("list-flow-instructions", payload); }
export function getFlowInstruction(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ instruction?: any }>("get-flow-instruction", payload); }
