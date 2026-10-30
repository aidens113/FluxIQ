// A judged trial's feedback says, for each field it holds, whether a judge said
// it or Core found it (framework plan P5b, `../feedback.ts`), kept to what the
// builder sees. A bookshop's readings: no task, site, item or answer of any
// realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioCandidateTrialFeedback } from "../feedback.ts";
import { SPENT_TWO } from "./fixtures.ts";

const summary: AutomationStudioRunResultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 2, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], flowShape: [], withheld: false };
const RECORDS = { stored: 2, refused: 0, missingRequired: 0 };
const judged = (verdict: AutomationStudioBuildTestVerdict) => automationStudioCandidateTrialFeedback.judged({ verdict, summary, trialRunId: "trial.1", start: "reset" }).feedback;

describe("provenance of a judged trial's feedback (P5b)", () => {
  it("marks a judge's no as the judge's reading and Core's lines as Core's findings", () => {
    const feedback = judged({ verdict: "no", expected: "Every paperback.", observed: "A hardback is kept.", advice: "Add a format condition.", findings: ["result.counts_look_right"], checked: ["\"Tide Charts\" is in the stored rows."], records: RECORDS, spent: { ...SPENT_TWO } });
    expect(feedback.provenance).toEqual({ judge: "judge_said", findings: "core_found", checked: "core_found" });
  });

  it("marks even the judge fields of a no Core made itself as Core's", () => {
    const feedback = judged({ verdict: "no", expected: "The 3 rows asked for.", observed: "Core counted 4 stored rows.", findings: ["result.computed_fact_failed"], checked: ["Core counted 4 stored rows."], records: RECORDS,
      standingNo: { source: "core", stored: ["A"], storedWhole: true, conditions: [], standing: [] }, spent: { ...SPENT_TWO } });
    expect(feedback.provenance).toEqual({ judge: "core_found", findings: "core_found", checked: "core_found" });
  });

  it("marks an unsure's readings as the judges' and its why and doubt as Core's, listing only what is held", () => {
    const feedback = judged({ verdict: "unknown", why: "The two calls did not agree.", unconfirmedReading: { observed: "A hardback is kept.", advice: "Add a format condition." }, answeredReading: { observed: "Every row is a paperback." }, doubtContradicted: "Core's record shows every page was read.", spent: { ...SPENT_TWO } });
    expect(feedback.provenance).toEqual({ why: "core_found", unconfirmedReading: "judge_said", answeredReading: "judge_said", doubtContradicted: "core_found", readings: "core_found" });
    expect(judged({ verdict: "unknown", why: "No call could tell.", spent: { ...SPENT_TWO } }).provenance).toEqual({ why: "core_found" });
  });

  it("marks a held yes that advised a change: Core's code, the yes's reading as the judge's", () => {
    const feedback = judged({ verdict: "not_judged", why: "Core held the yes.", changeAdvised: true, answeredReading: { observed: "Rows look right.", advice: "Loosen a condition." }, spent: { ...SPENT_TWO } });
    expect(feedback.provenance).toEqual({ why: "core_found", changeAdvised: "core_found", answeredReading: "judge_said" });
  });

  it("is absent on a yes and on an execution failure", () => {
    expect(judged({ verdict: "yes", spent: { ...SPENT_TWO } })).not.toHaveProperty("provenance");
    expect(automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset" }).feedback).not.toHaveProperty("provenance");
  });
});
