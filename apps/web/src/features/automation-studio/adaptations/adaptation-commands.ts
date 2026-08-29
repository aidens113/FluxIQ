import type { ProgramCommandTransport } from "../data/program-transport";
export function reviewFlowAdaptation(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ adaptation?: any }>("review-flow-adaptation", payload); }
