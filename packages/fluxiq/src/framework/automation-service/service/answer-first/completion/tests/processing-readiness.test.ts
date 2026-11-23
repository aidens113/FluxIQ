import { expect, it } from "vitest";
import { automationStudioAnswerFirstCompletionCheck } from "../index.ts";
import type { AutomationStudioAnswerFirstResultReadiness } from "../../result-feed/index.ts";

for (const success of ["caller", "off", "replay", "judge"] as const) it(`checks data readiness before ${success} acceptance and continues repairably`, async () => {
  let readiness: AutomationStudioAnswerFirstResultReadiness = { state: "missing-evidence", code: "answer_first.processing_evidence_missing", reason: "Read promoted on source A." };
  let judged = 0;
  let checked = 0;
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "List the records.", rows: async () => ({ datasetId: "result", totalRows: 1, truncated: false, columns: [{ id: "title", label: "Title" }], rows: [{ title: "A" }] }),
    acts: () => [], readsRan: () => true, processingReadiness: () => readiness, endView: async () => undefined, witnesses: () => ({}),
    purse: { keepBackForJudging: () => undefined }, say: () => undefined,
    ...(success === "caller" ? { confirm: { judge: "auto" as const, check: async () => {
      checked += 1;
      return true;
    } } } : success === "off" ? { confirm: { judge: "off" as const } } : {}),
    ...(success === "replay" ? { replay: () => ({ saved: { label: "confirmed" as const, provenWhole: true, shape: { columns: ["title"], empty: false } }, reachedEnd: true, repaired: false, steps: [{ position: 1, ran: "passed" as const }] }) } : {}),
    judge: async () => {
      judged += 1;
      return { verdict: "yes", reason: "Correct", checkedWhat: "Rows" };
    }
  });
  const refused = await check.check({ answer: "Done." });
  expect(refused).toMatchObject({ ok: false, issueCodes: ["answer_first.processing_evidence_missing"] });
  expect(checked + judged).toBe(0);
  expect(check.state.achieved).toBe(false);
  readiness = { state: "ready" };
  expect(await check.check({ answer: "Done." })).toEqual({ ok: true });
  expect(checked + judged).toBe(success === "caller" || success === "judge" ? 1 : 0);
  readiness = { state: "missing-evidence", code: "answer_first.processing_evidence_missing", reason: "A new read lacks its mark." };
  expect(await check.check({ answer: "Done." })).toMatchObject({ ok: false });
  expect(check.state.achieved).toBe(false);
  expect(check.state.takenUnverified).toBeUndefined();
});

it("explicit action-only N/A remains eligible for its normal success check", async () => {
  const check = automationStudioAnswerFirstCompletionCheck({
    instructions: "Renew the loan.", rows: async () => ({ totalRows: 0, truncated: false, columns: [], rows: [] }), acts: () => [], readsRan: () => false,
    processingReadiness: () => ({ state: "not-applicable" }), endView: async () => undefined, witnesses: () => ({}), purse: { keepBackForJudging: () => undefined }, say: () => undefined,
    confirm: { judge: "off" }, judge: async () => { throw new Error("Checking is off"); }
  });
  expect(await check.check({ answer: "Renewed." })).toEqual({ ok: true });
});
