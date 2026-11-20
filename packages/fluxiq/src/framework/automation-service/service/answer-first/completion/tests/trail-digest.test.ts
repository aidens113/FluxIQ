// t963: the judge is shown the whole trail, but whether to judge again is decided by the final data and the evidence
// bearing on it (`runtime/result-verification/flow-less/summary-digest.ts`). A throwaway look between two identical
// completions is no new evidence: the second is refused without a judge, and the count the loop handling climbs on goes
// up. A read that changes the rows is new evidence, and the judge then sees the whole trail, the look included.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowLessSummary, AutomationStudioResultTrailStep } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const READ: AutomationStudioResultTrailStep = { did: "catalogue.read", asked: { where: [{ field: "shelf", is: "present" }] }, outcome: "answered", where: "http://127.0.0.1:5000/catalogue", found: { page: "t1 \"Emma\" \"On shelf\"" } };
const LOOK: AutomationStudioResultTrailStep = { did: "page.find", asked: { query: "shelf" }, outcome: "answered", where: "http://127.0.0.1:5000/catalogue", found: { found: ["t1 \"On shelf\""] } };

function made() {
  const rows = [{ title: "Emma" }];
  const trail: AutomationStudioResultTrailStep[] = [READ];
  const judged: AutomationStudioFlowLessSummary[] = [];
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the books on the shelf, as a table with the column title",
    rows: async () => ({ datasetId: "result", totalRows: rows.length, truncated: false, columns: [{ id: "title", label: "title" }], rows: [...rows] }),
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    trail: () => trail,
    judge: async (summary) => {
      judged.push(summary);
      return { verdict: "unsure", reason: "The order cannot be told.", checkedWhat: "the books" };
    },
    purse,
    say: () => undefined
  });
  return { check, judged, trail, rows };
}

describe("whether a completion is judged again, with the trail shown", () => {
  it("refuses one after a throwaway look as the same evidence, with no judge call, and counts it", async () => {
    const { check, judged, trail } = made();
    await check.check({ summary: "Done." });
    expect(judged).toHaveLength(1);
    expect(judged[0]!.trail).toEqual([READ]);
    trail.push(LOOK);
    const again = await check.check({ summary: "Done." });
    expect(again).toMatchObject({ ok: false, issueCodes: [AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE] });
    expect(judged).toHaveLength(1);
    expect(check.state.refusedAgain).toBe(1);
  });

  it("judges again once a read changes the rows, and shows the judge the whole trail, the look included", async () => {
    const { check, judged, trail, rows } = made();
    await check.check({ summary: "Done." });
    trail.push(LOOK, READ);
    rows.push({ title: "Persuasion" });
    await check.check({ summary: "Done." });
    expect(judged).toHaveLength(2);
    expect(judged[1]!.trail).toEqual([READ, LOOK, READ]);
    expect(check.state.refusedAgain).toBe(0);
  });
});
