import type { ProgramCommandTransport } from "../data/program-transport";

export function listProjectProblems(api: ProgramCommandTransport, payload: Record<string, unknown>) {
  return api.post<{ problems?: any[]; page?: { problems?: any[]; total?: number; counts?: { error?: number; warning?: number; info?: number }; limit?: number; nextCursor?: string | null; hasMore?: boolean } }>("list-project-problems", payload);
}
