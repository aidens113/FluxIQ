import type { ProgramCommandTransport } from "../data/program-transport";

/** Saves explicit task authority without changing existing executable steps. */
export function saveTaskInstruction(api: Pick<ProgramCommandTransport, "post">, payload: { projectId: string; flowId: string; instruction: string; instructionId?: string; linkedRecordingIds?: string[] }) {
  return api.post<{ instruction?: { instructionId?: string; status?: string } }>("save-flow-generation-instruction", payload);
}
