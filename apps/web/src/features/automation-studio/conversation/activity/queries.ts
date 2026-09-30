// The one read over `get-activity`: a project's live activity, in the shape
// Core's handler answers (`{ current, recent }`, the hub's snapshot as is).
//
// A `get-` prefix, so the request coordinator deduplicates, retries and bounds
// it like the thread reads. The project is in the payload because Core reads
// it straight off the request, as every project-scoped call here does.

import type { ProgramCommandTransport } from "../../data/program-transport";
import { parseConversationActivitySnapshot, type ConversationActivitySnapshot } from "./contracts";

export type ConversationActivityQuery = { projectId: string };

export type ConversationActivityReadResult = {
  ok: boolean;
  aborted?: boolean;
  error?: string;
  snapshot?: ConversationActivitySnapshot;
};

export async function getConversationActivity(
  api: ProgramCommandTransport,
  payload: ConversationActivityQuery,
  signal?: AbortSignal
): Promise<ConversationActivityReadResult> {
  const result = await api.post<unknown>("get-activity", { projectId: payload.projectId }, signal ? { signal } : {});
  if (!result.ok) {
    return {
      ok: false,
      ...(result.aborted ? { aborted: true } : {}),
      ...(result.error ? { error: result.error } : {})
    };
  }
  return { ok: true, snapshot: parseConversationActivitySnapshot(result.payload) };
}
