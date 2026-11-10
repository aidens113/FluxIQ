// The pages a result's rows were read from reach the judge (`../check.ts`, `readPages`): a result made of rows
// read on two pages is judged with one entry per read, and a result with no rows is judged with none.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowLessSummary } from "../../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const READS = [
  { where: "http://127.0.0.1:5000/rooms?floor=2", place: "page=1", kept: 2 },
  { where: "http://127.0.0.1:5000/rooms?floor=2", place: "page=2", kept: 3 }
];

function made(rows: boolean) {
  const judged: AutomationStudioFlowLessSummary[] = [];
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the rooms on the second floor",
    rows: async () => rows
      ? { datasetId: "rooms", totalRows: 5, truncated: false, columns: [{ id: "room", label: "room" }], rows: [1, 2, 3, 4, 5].map((n) => ({ room: `Room ${n}` })) }
      : { totalRows: 0, truncated: false, columns: [], rows: [] },
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    readPages: () => READS,
    judge: async (summary) => {
      judged.push(summary);
      return { verdict: "unsure", reason: "Cannot tell.", checkedWhat: "the rooms" };
    },
    purse,
    say: () => undefined
  });
  return { check, judged };
}

describe("the pages a result's rows were read from, as evidence for the check", () => {
  it("hands the judge one entry per read of a result made of rows read on two pages", async () => {
    const { check, judged } = made(true);
    await check.check({ summary: "Done." });
    expect(judged[0]!.readPages).toEqual(READS);
  });

  it("hands the judge none for a result with no rows", async () => {
    const { check, judged } = made(false);
    await check.check({ answer: "There are none." });
    expect(judged[0]).not.toHaveProperty("readPages");
  });
});
