// Which page a read is, as the one fact that tells a replay from a next page (t1024).
//
// A read with no place said was always the next page after the last, so a Flow replayed again on the page it had read
// came back as another page and another "unplaced read" (bigbox run-mwuxd2v9-33928ea3: 19 pages for two lists). Rows
// are never compared to tell them apart. A read's `spot` is what does, and the pager's `place` is never filled in:
//
// - **A read by the model or a run's pass** (a call, a rerun, a replayed step) is at the draft step it reads for, the
//   page it ran on (`where`, the view its answer said, `../rows/read-evidence.ts`, else the address the replay came
//   from) and how often its list has moved (`listMove`, `./list-move.ts`, or a loop step's pass that moved it, counted
//   by `listKey`). A replay of the step on that page is that spot again; a move makes the next read a new one, by
//   address or in place; another step, page or list has its own. Two draft steps folded into one version stay apart.
// - **A read of a saved Flow's run** (a record batch) is at its step and its batch key. The key holds the node's
//   attempt number within its own run (`engine/automation/records/capture.ts`), so a Flow's own paging loop, whose
//   iterations are different attempts, stays separate pages, and the same Flow run again on the same page makes the
//   same keys, so the same spots.
import type { AutomationStudioAnswerFirstResultRead } from "../result/index.ts";

export type AutomationStudioAnswerFirstReadPlaces = {
  /** The list moved on: the next read of it has a new spot. */
  moved(listKey: string | undefined): void;
  /** `read` with the spot it is at for the draft step `stepId` (and `run`, a record batch's key), where one can be said. */
  spotted(read: AutomationStudioAnswerFirstResultRead, stepId: string, run?: string): AutomationStudioAnswerFirstResultRead;
};

export function automationStudioAnswerFirstReadPlaces(): AutomationStudioAnswerFirstReadPlaces {
  const moves = new Map<string, number>();
  return {
    moved(listKey) {
      const key = listKey ?? "";
      moves.set(key, (moves.get(key) ?? 0) + 1);
    },
    spotted(read, stepId, run) {
      if (run !== undefined) return { ...read, spot: JSON.stringify([stepId, run]) };
      if (read.where === undefined) return read;
      const listKey = read.version.listKey ?? "";
      return { ...read, spot: JSON.stringify([stepId, listKey, read.where, moves.get(listKey) ?? 0]) };
    },
  };
}
