// A no or an unsure says which columns the request names that the rows the check read lack, and how the asked table
// becomes the result (t1032). The recorded shape (run-mwv5m906-5e999159, 0081 and 0094): a request for a table with
// three named columns, a result that is another list read with other columns, a check unsure. The site is made up (a
// library's loans and its catalogue), as is every row.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowLessJudgement } from "../../../../../../runtime/result-verification/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../../../../../../runtime/llm/index.ts";
import { automationStudioFlowLessJudge } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE, automationStudioAnswerFirstCompletionCheck } from "../index.ts";

const purse: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0]["purse"] = { keepBackForJudging: () => undefined };
const ASKED = "Renew the oldest loan, keep the others, then show me my loans as a table with columns title, copies and due date.";
const CATALOGUE = [{ id: "name", label: "Name" }, { id: "due date", label: "Due date" }, { id: "shelf", label: "Shelf" }];
const catalogueRows: JsonObject[] = [{ name: "Tide Tables", "due date": "Friday", shelf: "B2" }, { name: "River Atlas", "due date": "Monday", shelf: "C1" }];
const LOANS = [{ id: "title", label: "Title" }, { id: "copies", label: "Copies" }, { id: "due_date", label: "Due date" }];
const loanRows: JsonObject[] = [{ title: "Tide Tables", copies: "1", due_date: "Friday" }];
const UNSURE: AutomationStudioFlowLessJudgement = { verdict: "unsure", reason: "The loans have not been shown as a table.", checkedWhat: "the loans" };

function made(columns: { id: string; label: string }[], rows: JsonObject[], judgement: AutomationStudioFlowLessJudgement = UNSURE, instructions = ASKED) {
  return automationStudioAnswerFirstCompletionCheck({
    instructions,
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows.length, truncated: false, columns, rows }),
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    judge: async () => judgement,
    purse,
    say: () => undefined
  });
}

async function refusedWords(check: ReturnType<typeof made>, summary = "Shown."): Promise<string> {
  const answer = await check.check({ summary, answer: "title | copies | due date" });
  if (answer.ok) throw new Error("It should have been refused.");
  return String(answer.feedback.instruction);
}

describe("a refused completion over rows that lack columns the request names", () => {
  it("says which named columns the rows lack, that they are not the table, and both ways the asked table becomes the result", async () => {
    const said = await refusedWords(made(CATALOGUE, catalogueRows));
    expect(said).toContain("The loans have not been shown as a table.");
    expect(said).toContain("The rows the check read hold columns name, due date, shelf, and no title or copies, which the request names, so they are not the table it asks for.");
    expect(said).toContain("The result is the draft's last read step not marked intermediate, as resultHolds.result names it.");
    expect(said).toContain("in a call with add: true, which makes that read the result's step");
    expect(said).toContain('amend_draft with change "take" and that read\'s call id');
    expect(said).toContain("Only new evidence changes");
  });

  it("says it again when the same evidence comes back, without another judge", async () => {
    const check = made(CATALOGUE, catalogueRows);
    await refusedWords(check);
    const again = await check.check({ summary: "Shown again.", answer: "title | copies | due date" });
    if (again.ok) throw new Error("It should have been refused.");
    expect(again.issueCodes).toEqual([AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE]);
    expect(String(again.feedback.instruction)).toContain("and no title or copies, which the request names");
  });

  it("says nothing of columns where the rows hold every named one, by name or written with other case or separators", async () => {
    expect(await refusedWords(made(LOANS, loanRows))).not.toContain("The rows the check read hold columns");
  });

  it("says nothing of columns where the request names none", async () => {
    expect(await refusedWords(made(CATALOGUE, catalogueRows, UNSURE, "Renew the oldest loan and show me my loans."))).not.toContain("The rows the check read hold columns");
  });

  it("refuses no yes itself: a yes the judge gave stands here (the judge refuses one over such rows, `cited-yes/records-yes.ts`)", async () => {
    const answer = await made(CATALOGUE, catalogueRows, { verdict: "yes", reason: "It was judged to be what was asked for.", checkedWhat: "the loans" }).check({ summary: "Shown." });
    expect(answer.ok).toBe(true);
  });
});

describe("the 0094 shape through the real judge (t1032)", () => {
  // The run's yes: no defects, the table only in the model's words, no records asked, over the catalogue's rows.
  const YES_0094 = { answersRequest: "yes", defects: [], checked: [{ row: "Tide Tables", column: "due date", value: "Friday" }], answerRecords: { asked: false, siteShows: 1 } };
  const YES_LOANS = { answersRequest: "yes", defects: [], checked: [{ row: "Tide Tables", column: "copies", value: "1" }], answerRecords: { asked: true, siteShows: 1 } };
  const provider = (answer: Record<string, unknown>): AutomationStudioLlmProvider => ({
    metadata: { provider: "mock", model: "debug-model" },
    estimateCostUsd: () => 0.001,
    runTask: async () => ({ response: { kind: "diagnosis", summary: "Request appears met.", diagnosis: answer, confidence: 0.8 }, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 } }) as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>
  });
  const judged = (columns: { id: string; label: string }[], rows: JsonObject[], answer: Record<string, unknown>) => automationStudioAnswerFirstCompletionCheck({
    instructions: ASKED,
    rows: async () => ({ datasetId: "dataset.1", totalRows: rows.length, truncated: false, columns, rows }),
    acts: () => [],
    readsRan: () => true,
    endView: async () => undefined,
    witnesses: () => ({}),
    // The result's own evidence, as the feed declares it: the table the request names (`../../result-feed/feed.ts`).
    resultEvidence: () => ({ pages: [], coverage: [], working: [], looks: [], answerContract: { columns: ["title", "copies", "due date"] } }),
    judge: (summary) => automationStudioFlowLessJudge({ summary, provider: provider(answer), run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] }),
    purse,
    say: () => undefined
  });

  it("stays refused, naming the mismatch and the way to make the asked table the result", async () => {
    const answer = await judged(CATALOGUE, catalogueRows.slice(0, 1), YES_0094).check({ summary: "Done.", answer: "title | copies | due date" });
    if (answer.ok) throw new Error("A yes over another list's rows must not pass.");
    expect(answer.issueCodes).toEqual(["answer_first.judged_unsure"]);
    const said = String(answer.feedback.instruction);
    expect(said).toContain("The check said yes, but it does not stand on the rows the result holds");
    expect(said).toContain("have no title or copies column, so they are not the table it asks for");
    expect(said).toContain("in a call with add: true, which makes that read the result's step");
  });

  it("passes the asked table's own rows", async () => {
    expect(await judged(LOANS, loanRows, YES_LOANS).check({ summary: "Done.", answer: "title | copies | due date" })).toEqual({ ok: true });
  });
});
