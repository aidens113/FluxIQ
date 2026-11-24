// A judge's no carries what it found wrong to the model, beside its words, and again when the same
// evidence comes back (t1011, run-mwug2xjw-41f62603: a best result judged no was told back as prose
// alone, and the model went back to a look it had already made). The check alone, with no loop
// around it; the site is made up (a garden centre's plants), as is every row.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowLessJudgement } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS, AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const columns = [{ id: "name", label: "Name" }, { id: "height", label: "Height" }];
const rows: JsonObject[] = [{ name: "Lavender", height: "40cm" }, { name: "Foxglove", height: "150cm" }];
const DEFECT = { kind: "kept_not_asked" as const, row: "Foxglove", column: "height", value: "150cm", requestWords: "no taller than a metre" };
const NO: AutomationStudioFlowLessJudgement = {
  verdict: "no",
  reason: "A plant taller than a metre is kept.",
  checkedWhat: "the plants",
  found: { defects: [DEFECT], checkedRows: ["\"Foxglove\" is called wrongly kept, and the result holds it."] }
};

function made(judgement: AutomationStudioFlowLessJudgement, confirm?: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["confirm"]) {
  let judged = 0;
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the perennials no taller than a metre, with their heights",
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows.length, truncated: false, columns, rows }),
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async () => {
      judged += 1;
      return judgement;
    },
    ...(confirm ? { confirm } : {}),
    purse,
    say: () => undefined
  });
  return { check, judged: () => judged };
}

describe("a judge's no, as the model is shown it", () => {
  it("carries the check's defects and Core's check of the rows they name, with what each kind of defect is fixed by", async () => {
    const { check } = made(NO);
    const answer = await check.check({ summary: "Listed." });
    if (answer.ok) throw new Error("It should have been refused.");
    expect(answer.issueCodes).toEqual(["answer_first.judged_no"]);
    expect(answer.feedback.defects).toEqual([DEFECT]);
    expect(answer.feedback.checkedRows).toEqual(["\"Foxglove\" is called wrongly kept, and the result holds it."]);
    const said = String(answer.feedback.instruction);
    expect(said).toContain("A plant taller than a metre is kept.");
    expect(said).toContain("defects lists what the check found wrong, in its own words");
    expect(said).toContain("Compare each with resultHolds, then work on what is still wrong there, not on anything you have already tried");
    expect(said).toContain("when the result's processing declares the condition, deduplication or order the request gives");
    expect(said).toContain("Only new evidence changes");
    expect(check.state.refused?.found).toEqual(NO.found);
  });

  it("names the result's processing declared anew as new evidence, keeping every way it named before", () => {
    const said = AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS.judged("No.");
    expect(said).toContain("a read that returns different rows or the same rows in a different order, the result's processing declared anew so that it keeps other rows or another order, after your acts a look");
    expect(said).not.toContain("defects lists");
  });

  it("carries them again when the same evidence comes back, without another judge", async () => {
    const { check, judged } = made(NO);
    await check.check({ summary: "Listed." });
    const again = await check.check({ summary: "Listed, said again." });
    expect(judged()).toBe(1);
    if (again.ok) throw new Error("It should have been refused.");
    expect(again.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(again.feedback.defects).toEqual([DEFECT]);
    expect(String(again.feedback.instruction)).toContain("work on a defect it listed, or go to where");
  });

  it("reads as before where the no listed nothing, and for an unsure", async () => {
    const listedNothing: AutomationStudioFlowLessJudgement = { verdict: "no", reason: NO.reason, checkedWhat: "the plants" };
    const unsure: AutomationStudioFlowLessJudgement = { verdict: "unsure", reason: "Cannot tell.", checkedWhat: "the plants", found: NO.found! };
    for (const judgement of [listedNothing, unsure]) {
      const answer = await made(judgement).check.check({ summary: "Listed." });
      if (answer.ok) throw new Error("It should have been refused.");
      expect(answer.feedback.defects).toBeUndefined();
      expect(answer.feedback.checkedRows).toBeUndefined();
      expect(String(answer.feedback.instruction)).not.toContain("defects lists");
    }
  });

  it("a yes is the attempt's result, with nothing to carry", async () => {
    const { check } = made({ verdict: "yes", reason: "It is.", checkedWhat: "the plants" });
    expect(await check.check({ summary: "Listed." })).toEqual({ ok: true });
    expect(check.state.achieved).toBe(true);
    expect(check.state.refused).toBeUndefined();
  });
});
