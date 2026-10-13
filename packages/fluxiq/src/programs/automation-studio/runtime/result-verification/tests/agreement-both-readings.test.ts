// Two checks that both said no carry both readings, and a reading Core's own
// record contradicts is marked so (t501, D1).
//
// Live run `run-mv6i27oi-a87fb247`, trial 1: both judges said no, for different
// reasons. The first blamed paging ("many more pages; the read stopped at page
// 5, not every page") although every read's account said the list ended; the
// second named the two stored rows that did not belong and called the paging
// correct. Only the first reading was forwarded, and the model spent six
// decisions and a whole trial on paging before it fixed the rows.
//
// An unsure beside a yes is weighed against the same record, and a doubt it
// contradicts is asked once more with the record named (t503, D3). Lane C
// round 17 (`run-mv6lgqi6-4bfab2e1`, trial 3, 0037/0038): one judge answered
// unknown because "later pages were never read", against every paging read's
// own account that its list ended; the other said yes. The trial was left
// unconfirmed, the correct revision was retested, and the build ran out of
// time. The agreement rule itself is unchanged: an unsure beside a yes stays
// unsure.
import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultReadAccount, type AutomationStudioResultVerification, type AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../agreement.ts";
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

const verdict = (answersRequest: "yes" | "no" | "unknown", diagnosis: { expected?: string; observed?: string; changed?: string } = {}): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest, ...diagnosis }, basis: "model" });

/** The round-17 doubt: pages the read is said never to have reached. */
const pagingDoubt = verdict("unknown", {
  expected: "Every matching item in the list.",
  observed: "The search reports over 1,000 results, but later pages were never read, so I cannot confirm every match was kept.",
  changed: "Read the remaining pages before judging."
});
const otherDoubt = verdict("unknown", { observed: "I cannot tell whether the stored prices include tax." });
const yes = verdict("yes", { expected: "Every matching item.", observed: "13 rows, each matching." });

describe("an unsure verdict", () => {
  it("keeps what the judge doubted, screened, and still carries no repair", () => {
    expect(pagingDoubt).toMatchObject({ verdict: "unsure", basis: "model", unsureReading: { expected: "Every matching item in the list.", advice: "Read the remaining pages before judging." } });
    expect(pagingDoubt.unsureReading?.observed).toContain("later pages were never read");
    expect(pagingDoubt).not.toHaveProperty("repair");
    // A silent reply doubted nothing.
    expect(automationStudioResultVerdict({ summary, basis: "model_silent" })).not.toHaveProperty("unsureReading");
  });
});

describe("an unsure beside a yes", () => {
  it("marks the unsure call contradicted when every paging read's record says its list ended, and stays unsure", () => {
    const agreed = automationStudioResultVerificationAgreement({ first: pagingDoubt, second: yes, confirmAnswer: true, reads: [ended] });
    expect(agreed).toMatchObject({ verdict: "unsure", basis: "model_disagreed", verdicts: ["unsure", "answers"], calls: 2, contradictedUnsure: { call: 1 } });
    expect(agreed.contradictedUnsure?.record).toContain("n2");
    expect(agreed.contradictedUnsure?.record).toContain("every page (5) and the list ended");
    // The other order: a yes, then the doubt.
    const later = automationStudioResultVerificationAgreement({ first: yes, second: pagingDoubt, confirmAnswer: true, reads: [ended] });
    expect(later).toMatchObject({ verdict: "unsure", contradictedUnsure: { call: 2 } });
  });

  it("marks nothing where the record leaves the paging open, or the doubt is not about pages", () => {
    expect(automationStudioResultVerificationAgreement({ first: pagingDoubt, second: yes, confirmAnswer: true, reads: [bounded] })).not.toHaveProperty("contradictedUnsure");
    expect(automationStudioResultVerificationAgreement({ first: otherDoubt, second: yes, confirmAnswer: true, reads: [ended] })).not.toHaveProperty("contradictedUnsure");
    expect(automationStudioResultVerificationAgreement({ first: pagingDoubt, second: yes, confirmAnswer: true })).not.toHaveProperty("contradictedUnsure");
  });
});

describe("the one re-ask of a contradicted unsure", () => {
  const input = { first: pagingDoubt, second: yes, confirmAnswer: true, reads: [ended] };
  const settled = automationStudioResultVerificationAgreement(input);

  it("asks the same call once with Core's record named, and a yes there confirms the yes beside it", async () => {
    const ask = vi.fn(async (_recheck: string) => yes);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    const recheck = ask.mock.calls[0]![0];
    expect(recheck).toContain("every page (5) and the list ended");
    expect(recheck).toMatch(/Answer again/u);
    expect(outcome).toMatchObject({ verdict: "answers", verdicts: ["unsure", "answers", "answers"], calls: 3, contradictedUnsure: { call: 1, reasked: true } });
  });

  it("stays unsure, never a yes, when the re-asked reading still contradicts the record, and asks no more", async () => {
    const ask = vi.fn(async (_recheck: string) => pagingDoubt);
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", verdicts: ["unsure", "answers", "unsure"], calls: 3, contradictedUnsure: { call: 1, reasked: true } });
  });

  it("keeps the settled unsure when the re-ask did not come back usable", async () => {
    const unavailable = automationStudioResultVerdict({ summary, basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    const outcome = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask: async () => unavailable });
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 3, contradictedUnsure: { reasked: true } });
  });

  it("asks nothing where nothing was contradicted, or the re-ask was already made", async () => {
    const ask = vi.fn(async (_recheck: string) => yes);
    const plain = automationStudioResultVerificationAgreement({ first: otherDoubt, second: yes, confirmAnswer: true, reads: [ended] });
    expect(await automationStudioResultVerificationReaskContradicted({ first: otherDoubt, second: yes, confirmAnswer: true, reads: [ended], settled: plain, ask })).toBe(plain);
    const once = await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask: async () => pagingDoubt });
    expect(await automationStudioResultVerificationReaskContradicted({ ...input, settled: once, ask })).toBe(once);
    expect(ask).not.toHaveBeenCalled();
  });
});
