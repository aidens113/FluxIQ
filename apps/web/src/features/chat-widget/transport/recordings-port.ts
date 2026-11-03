// The recordings a person may attach, from `list-recordings` (summaries). The
// chat counts pages from 1; Core pages by offset.

import type { ChatRecordingsPort, ChatRecordingSummary } from "@fluxiq/ui-components";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "./chat-result";
import type { ProgramChatTransportOptions } from "./options";
import { projectFor } from "./project-for";

export function createRecordingsPort(api: ProgramCommandTransport, options: Pick<ProgramChatTransportOptions, "projectId">): ChatRecordingsPort {
  return {
    async list(query) {
      const project = projectFor(undefined, options);
      if (!project.ok) return project.failure;
      const pageSize = Math.max(1, Math.floor(query.pageSize));
      const offset = Math.max(0, Math.floor(query.page) - 1) * pageSize;
      const response = await api.post<{ recordings?: unknown }>("list-recordings", { projectId: project.projectId, summaries: true, limit: pageSize, offset });
      return chatResult(response, (payload) => ({ items: summaries(payload?.recordings, project.projectId) }));
    }
  };
}

function summaries(recordings: unknown, projectId: string): ChatRecordingSummary[] {
  const items: ChatRecordingSummary[] = [];
  for (const entry of Array.isArray(recordings) ? recordings : []) {
    const record = (entry ?? {}) as Record<string, unknown>;
    const id = record.recordingId;
    if (typeof id !== "string" || !id) continue;
    items.push({
      id,
      projectId,
      description: typeof record.description === "string" ? record.description : undefined,
      status: typeof record.status === "string" ? record.status : undefined,
      startedAt: typeof record.startedAt === "number" ? record.startedAt : undefined,
      endedAt: typeof record.endedAt === "number" ? record.endedAt : undefined
    });
  }
  return items;
}
