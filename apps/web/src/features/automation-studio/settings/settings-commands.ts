import type { ProgramCommandTransport } from "../data/program-transport";
export function saveFlowSettings(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ flow?: any }>("save-flow", payload); }
export function updateSubflowSettings(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ subflow?: any }>("update-flow-subflow", payload); }
export function changeSubflowLifecycle(api: ProgramCommandTransport, endpoint: "enable-flow-subflow" | "disable-flow-subflow" | "archive-flow-subflow", payload: Record<string, any>) { return api.post<{ subflow?: any }>(endpoint, payload); }
