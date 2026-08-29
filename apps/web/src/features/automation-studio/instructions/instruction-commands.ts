import type { ProgramCommandTransport } from "../data/program-transport";
export function saveFlowInstruction(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ instruction?: any }>("save-flow-instruction", payload); }
