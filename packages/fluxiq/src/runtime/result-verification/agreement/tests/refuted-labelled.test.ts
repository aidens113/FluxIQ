// The advice a builder is shown of a judged trial leaves out a reading Core's
// record wholly refutes (t687, `../refuted-labelled.ts`). A8 cost round
// `run-mvblov2i-abb7d82e` step 0039: call 1's reading came labelled
// "contradicted by Core's record", and its advice -- drop a condition the
// request asks for -- still reached the builder, which followed it. The
// readings here are a bookshop's: no task, site, item or answer of any
// realistic scenario. Each is labelled by the agreement's own labellers.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { bothReadings } from "../both-readings.ts";
import { automationStudioResultAdviceShown, refutedLabelled } from "../refuted-labelled.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 6, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
  recordSets: [], flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n2", definitionId: "extract" }], withheld: false
};
const ended: AutomationStudioResultReadAccount = { nodeId: "n2", definitionId: "extract", pagesRead: 3, pageLimit: 10, stop: "control_disabled", truncated: false, kept: 6, paginates: true };

const no = (observed: string, changed: string): AutomationStudioResultVerification =>
  automationStudioResultVerdict({ summary, diagnosis: { answersRequest: "no", expected: "Every paperback in stock, leaving out signed copies.", observed, changed }, basis: "model" });

/** Call 1 says a stored row is missing, which Core's record wholly refutes; call 2 names a row that does not belong. */
const refuted = no("The read left out \"Tide Charts\", a paperback the request asks for.", "Remove condition 1 (signed is absent) so signed paperbacks come back.");
const standing = no("The stored rows include a hardback, which is not a paperback.", "Add a condition keeping only rows whose format is paperback.");
const FINDING = "\"Tide Charts\" is in the stored rows: another copy of it was kept.";

describe("the advice a builder is shown of a judged trial (t687)", () => {
  it("leaves out the advice of a reading Core's record wholly refutes, keeping the other call's and saying why", () => {
    const judgement = bothReadings(refuted, standing, [ended], undefined, new Map([[1, { wholly: true, findings: [FINDING] }]])).repair?.judgement;
    // As the agreement writes it, both calls' advice is there.
    expect(judgement?.advice).toContain("Remove condition 1");
    const shown = automationStudioResultAdviceShown(judgement?.advice);
    expect(shown).not.toContain("Remove condition 1");
    expect(shown).toContain("Judge call 2: Add a condition keeping only rows whose format is paperback.");
    expect(shown).toContain("Judge call 1's advice is left out: Core's record contradicts every claim its reading makes");
  });

  it("leaves out a single wholly refuted reading's advice, as the agreement labels an unsettled one", () => {
    const labelled = refutedLabelled({ observed: "x", advice: "Remove condition 1 (signed is absent)." }, { call: 2, wholly: true, findings: [FINDING] });
    expect(automationStudioResultAdviceShown(labelled.advice)).toBe("Judge call 2's advice is left out: Core's record contradicts every claim its reading makes, so the change it named rests on nothing the trial shows.");
  });

  it("shows a reading Core's record refutes only in part as it was", () => {
    const judgement = bothReadings(refuted, standing, [ended], undefined, new Map([[1, { wholly: false, findings: [FINDING] }]])).repair?.judgement;
    expect(automationStudioResultAdviceShown(judgement?.advice)).toBe(judgement?.advice);
  });

  it("shows a reading the paging record contradicts as it was (t501)", () => {
    const pages = no("The site shows many more pages; the read stopped at page 3.", "Follow the remaining pages.");
    const judgement = bothReadings(pages, standing, [ended], undefined).repair?.judgement;
    expect(judgement?.advice).toMatch(/Judge call 1 \(contradicted by Core's record[^)]*\): Follow the remaining pages/u);
    expect(automationStudioResultAdviceShown(judgement?.advice)).toBe(judgement?.advice);
  });

  it("shows advice with no call's label as it was", () => {
    expect(automationStudioResultAdviceShown("Add a condition keeping only paperbacks.")).toBe("Add a condition keeping only paperbacks.");
    expect(automationStudioResultAdviceShown(undefined)).toBeUndefined();
  });
});
