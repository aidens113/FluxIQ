// What a run of Flow steps says of the result's list (`../result-list.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftPartResultList } from "../result-list.ts";

const note = (rows: number, replacedRows: number) => ({ code: "answer_first.result_list_replaced", rows, pages: [{ kept: rows }], replaced: { rows: replacedRows }, instruction: `for ${rows}` });

describe("the run's note on the result's list", () => {
  it("none when no pass carried one", () => {
    expect(automationStudioFlowDraftPartResultList([{ ok: true }, "text", null, { resultList: "not an object" }])).toBeUndefined();
    expect(automationStudioFlowDraftPartResultList([])).toBeUndefined();
  });

  it("one pass's note is carried whole", () => {
    expect(automationStudioFlowDraftPartResultList([{ ok: true }, { ok: true, resultList: note(5, 12) }])).toEqual(note(5, 12));
  });

  it("several passes: what the result held before the run, and what the last switch left", () => {
    expect(automationStudioFlowDraftPartResultList([{ resultList: note(11, 12) }, { ok: true }, { resultList: note(16, 11) }])).toEqual({ ...note(16, 12), instruction: "for 11" });
  });
});
