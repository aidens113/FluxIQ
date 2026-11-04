// How anything outside an attempt reads its rows: `list`, `get` and `latest`, as the store answers
// them, with one thing first. A `working` or `waiting_for_person` row that no attempt in this
// service is working on is rewritten once as `waiting_for_person`, reason `interrupted`, keeping
// what it holds, so a Core that restarted never shows a task as still going. The chat's reads go
// through here, and a new attempt's opening does too.
//
// **A store that cannot be read answers as the store does**, and a rewrite that fails costs that
// write: the row still reads as interrupted, and the next read tries again. This adds no ending.
//
// **Ending and reading can cross.** An attempt writes its ending and only then stops being live,
// so a row read before that could look unfinished by the time it is checked, and rewriting it would
// lose the ending. So a read that saw an attempt stop while it was reading reads again, and the
// live check sits right before the store's own queue, so a press that claimed the attempt first
// always writes after this.

import { automationStudioAnswerFirstAttemptStoreOf, type AutomationStudioAnswerFirstAttemptRecord, type AutomationStudioAnswerFirstAttemptStore } from "../attempt-store/index.ts";
import { automationStudioAnswerFirstInterruptedView } from "./interrupted-view.ts";
import { automationStudioAnswerFirstLiveAttemptsOf } from "./live-attempts.ts";

export type AutomationStudioAnswerFirstAttemptsRead = Pick<AutomationStudioAnswerFirstAttemptStore, "list" | "get" | "latest">;

/** The facade over the service's attempt store (header). */
export function automationStudioAnswerFirstAttemptsRead(owner: object, ports: Parameters<typeof automationStudioAnswerFirstAttemptStoreOf>[1]): AutomationStudioAnswerFirstAttemptsRead {
  const store = automationStudioAnswerFirstAttemptStoreOf(owner, ports);
  const live = automationStudioAnswerFirstLiveAttemptsOf(owner);
  const swept = async (projectId: string, flowId: string, row: AutomationStudioAnswerFirstAttemptRecord): Promise<AutomationStudioAnswerFirstAttemptRecord> => {
    if (live.has(row.attempt.attemptId)) return row;
    const view = automationStudioAnswerFirstInterruptedView(row);
    if (!view) return row;
    await rewritten(store, projectId, flowId, view);
    return view;
  };
  const list = async (projectId: string, flowId: string): Promise<AutomationStudioAnswerFirstAttemptRecord[]> => {
    let released: number;
    let rows: AutomationStudioAnswerFirstAttemptRecord[];
    do {
      released = live.releases();
      rows = await store.list(projectId, flowId);
    } while (released !== live.releases());
    const answered: AutomationStudioAnswerFirstAttemptRecord[] = [];
    for (const row of rows) answered.push(await swept(projectId, flowId, row));
    return answered;
  };
  return {
    list,
    get: async (projectId, flowId, attemptId) => (await list(projectId, flowId)).find((row) => row.attempt.attemptId === attemptId),
    latest: async (projectId, flowId) => (await list(projectId, flowId)).at(-1)
  };
}

/** The write, which may fail: the view is still the answer (header). */
async function rewritten(store: AutomationStudioAnswerFirstAttemptStore, projectId: string, flowId: string, view: AutomationStudioAnswerFirstAttemptRecord): Promise<{ ok: true } | { ok: false; errorName: string }> {
  try {
    await store.save(projectId, flowId, view);
    return { ok: true };
  } catch (error) {
    return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
  }
}
