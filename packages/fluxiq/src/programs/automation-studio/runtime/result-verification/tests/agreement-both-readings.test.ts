// Two checks that both said no carry both readings, and a reading Core's own
// record contradicts is marked so (t501, D1).
//
// Live run `run-mv6i27oi-a87fb247`, trial 1: both judges said no, for different
// reasons. The first blamed paging ("many more pages; the read stopped at page
// 5, not every page") although every read's account said the list ended; the
// second named the two stored rows that did not belong and called the paging
// correct. Only the first reading was forwarded, and the model spent six
// decisions and a whole trial on paging before it fixed the rows.
import { describe, expect, it } from "vitest";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultReadAccount, type AutomationStudioResultVerification, type AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationAgreement } from "../agreement.ts";
import { automationStudioResultVerdict } from "../verdict.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 15,
  totalRefusedCount: 0,
  totalRowsMissingRequired: 0,
  recordSetCount: 1,
  recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n2", definitionId: "extract" }],
  withheld: false
};

/** A read that followed five pages and stopped because the list had no next page. */
const ended: AutomationStudioResultReadAccount = { nodeId: "n2", definitionId: "extract", pagesRead: 5, pageLimit: 10, stop: "control_disabled", truncated: false, kept: 15, paginates: true };
/** The same read, stopped by its own page bound. */
const bounded: AutomationStudioResultReadAccount = { ...ended, pageLimit: 5, stop: "page_limit", truncated: true };

const no = (diagnosis: { expected?: string; observed?: string; changed?: string; stillAchievable?: "yes" | "no" | "unknown" }): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", ...diagnosis }, basis: "model" });

const paging = no({
  expected: "Every product in the list, across all its pages.",
  observed: "The site shows many more pages; the read stopped at page 5, not every page.",
  changed: "Follow the remaining pages."
});
const rows = no({
  expected: "Only the products asked for.",
  observed: "The stored rows include two items that are not the product asked for. The paging loop read all 5 pages and stopped when no further page was found, which is correct.",
  changed: "Narrow the condition so those two rows are left out."
});

describe("two checks that both said no", () => {
  it("forward both readings, leading with the one the record does not contradict, and mark the other as contradicted", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: paging, second: rows, reads: [ended] });
    expect(agreed).toMatchObject({ verdict: "does_not_answer", verdicts: ["does_not_answer", "does_not_answer"], calls: 2 });
    expect(automationStudioResultVerificationFailsRun(agreed)).toBe(true);
    const judgement = agreed.repair?.judgement;
    // The second call's reading is there, and leads.
    expect(judgement?.observed).toContain("two items that are not the product asked for");
    expect(judgement?.advice).toContain("Narrow the condition");
    expect(judgement!.observed!.indexOf("two items")).toBeLessThan(judgement!.observed!.indexOf("many more pages"));
    // The first call's reading is there too, marked as contradicted by Core's record.
    expect(judgement?.observed).toMatch(/Judge call 1 \(contradicted by Core's record[^)]*\): The site shows many more pages/u);
    expect(judgement?.advice).toMatch(/Judge call 1 \(contradicted by Core's record[^)]*\): Follow the remaining pages/u);
    expect(judgement?.observed).toMatch(/^Judge call 2: The stored rows/u);
    // The second reading is never marked: "no further page" agrees with the record.
    expect(judgement?.observed).not.toMatch(/Judge call 2 \(contradicted/u);
  });

  it("forward both readings in call order, neither marked, where the record does not contradict either", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: paging, second: rows, reads: [bounded] });
    const observed = agreed.repair?.judgement?.observed ?? "";
    expect(observed).toMatch(/^Judge call 1: The site shows many more pages/u);
    expect(observed).toContain("Judge call 2: The stored rows include two items");
    expect(observed).not.toContain("contradicted");
  });

  it("marks a lone reading the record contradicts", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: paging, second: no({}), reads: [ended] });
    expect(agreed.repair?.judgement?.observed).toMatch(/^Judge call 1 \(contradicted by Core's record/u);
  });

  it("keeps the first call's directive exactly as it was where both said the same, or the second said nothing", () => {
    expect(automationStudioResultVerificationAgreement({ first: rows, second: rows, reads: [ended] }).repair).toEqual(rows.repair);
    expect(automationStudioResultVerificationAgreement({ first: rows, second: no({}), reads: [ended] }).repair).toEqual(rows.repair);
    expect(automationStudioResultVerificationAgreement({ first: rows, second: no({}) }).repair).toEqual(rows.repair);
  });

  it("says once, unlabelled, a field both calls worded alike", () => {
    const other = no({ expected: rows.repair!.judgement!.expected!, changed: "Leave out the two stored rows that are not the product." });
    const judgement = automationStudioResultVerificationAgreement({ first: rows, second: other }).repair?.judgement;
    expect(judgement?.expected).toBe("Only the products asked for.");
    expect(judgement?.advice).toBe("Judge call 1: Narrow the condition so those two rows are left out. Judge call 2: Leave out the two stored rows that are not the product.");
  });

  it("ends a build not doable only where every reading it weighs says so", () => {
    const hopeless = no({ observed: "There is nothing like it.", stillAchievable: "no" });
    const hopeful = no({ observed: "Two rows are wrong.", stillAchievable: "yes" });
    expect(automationStudioResultVerificationAgreement({ first: hopeless, second: hopeful }).repair?.judgement?.stillAchievable).toBe("yes");
    expect(automationStudioResultVerificationAgreement({ first: hopeless, second: no({ observed: "Nothing to find.", stillAchievable: "no" }) }).repair?.judgement?.stillAchievable).toBe("no");
  });
});
