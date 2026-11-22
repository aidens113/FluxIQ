import { expect, it } from "vitest";
import { automationStudioAnswerFirstCompletionCheck } from "../index.ts";

it("permits the normal success check for a known-empty declared minRows:0 answer without claiming universal success", async () => {
  let confirmed = 0;
  const check = automationStudioAnswerFirstCompletionCheck({ instructions: "Report matching records; zero matches are allowed.", rows: async () => ({ datasetId: "known-empty", totalRows: 0, truncated: false, columns: [{ id: "title", label: "Title" }], rows: [] }),
    acts: () => [], readsRan: () => true, processingReadiness: () => ({ state: "ready" }), emptyResult: () => "An unrelated look contains rows.", endView: async () => undefined, witnesses: () => ({}), purse: { keepBackForJudging: () => undefined }, say: () => undefined,
    confirm: { judge: "auto", check: async (summary) => {
      confirmed += 1;
      expect(summary.rows?.totalRows).toBe(0);
      return true;
    } }, judge: async () => { throw new Error("Caller confirmation is enough"); }
  });
  expect(await check.check({ summary: "No matching records." })).toEqual({ ok: true });
  expect(confirmed).toBe(1);
  expect(check.state.achieved).toBe(true);
});
