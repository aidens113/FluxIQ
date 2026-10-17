// A judged trial's feedback shows what a wholly refuted reading observed, but
// not its advice (t687, `../feedback.ts`). A8 cost round
// `run-mvblov2i-abb7d82e` step 0039: the builder was handed call 1's advice to
// drop a condition the request asks for, labelled "contradicted by Core's
// record", and followed it. A bookshop's readings: no task, site, item or
// answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback } from "../feedback.ts";
import { SPENT_TWO } from "./fixtures.ts";

const summary: AutomationStudioRunResultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 6, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [], flowShape: [], withheld: false };

const WHOLLY = "Judge call 1 (contradicted by Core's record: \"Tide Charts\" is in the stored rows: another copy of it was kept.)";
const OBSERVED = `Judge call 2: The stored rows include a hardback. ${WHOLLY}: The read left out "Tide Charts", a paperback the request asks for.`;
const ADVICE = `Judge call 2: Add a condition keeping only paperbacks. ${WHOLLY}: Remove condition 1 (signed is absent).`;

const judged = (verdict: AutomationStudioBuildTestVerdict) => automationStudioCandidateTrialFeedback.judged({ verdict, summary, trialRunId: "trial.1", start: "reset" }).feedback;

describe("a judged trial's feedback of a reading Core's record wholly refutes (t687)", () => {
  it("shows a no's observed as it was, and its advice less that reading's", () => {
    const judge = judged({ verdict: "no", expected: "Every paperback, leaving out signed copies.", observed: OBSERVED, advice: ADVICE, findings: [], records: { stored: 6, refused: 0, missingRequired: 0 }, spent: { ...SPENT_TWO } }).judge as Record<string, string>;
    expect(judge.observed).toBe(OBSERVED);
    expect(judge.advice).toContain("Judge call 2: Add a condition keeping only paperbacks.");
    expect(judge.advice).not.toContain("Remove condition 1");
    expect(judge.advice).toContain("Judge call 1's advice is left out");
  });

  it("shows an unsure's unconfirmed reading the same way", () => {
    const reading = { observed: `${WHOLLY}: The read left out "Tide Charts".`, advice: `${WHOLLY}: Remove condition 1 (signed is absent).`, recordContradicts: "whole" as const };
    const shown = judged({ verdict: "unknown", why: "The two calls did not agree.", unconfirmedReading: reading, spent: { ...SPENT_TWO } }).unconfirmedReading as Record<string, string>;
    expect(shown.observed).toBe(reading.observed);
    expect(shown.advice).not.toContain("Remove condition 1");
    expect(shown.recordContradicts).toBe("whole");
  });
});
