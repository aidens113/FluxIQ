import type { ProgramCommandTransport } from "../data/program-transport";
export type SubflowDirectoryAction = "rename" | "duplicate" | "enable" | "disable" | "archive" | "delete";
const ENDPOINTS: Record<SubflowDirectoryAction, string> = { rename: "rename-flow-subflow", duplicate: "duplicate-flow-subflow", enable: "enable-flow-subflow", disable: "disable-flow-subflow", archive: "archive-flow-subflow", delete: "delete-flow-subflow" };
export function applySubflowDirectoryAction(api: ProgramCommandTransport, action: SubflowDirectoryAction, payload: Record<string, any>) { return api.post(ENDPOINTS[action], payload); }
