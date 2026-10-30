// A not_judged after a yes Core held for its exclusion evidence, whose judge also said the Flow needs a change, shows the
// builder that a change was advised -- Core's code first, then Core's short words -- beside that yes's reading and the
// change it named (t636, `../feedback.ts`). A candidate trial and a subflow trial both read their judge's verdict through
// this feedback; each is run here with its judge's verdict injected. Every other not_judged is as it was.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { runAutomationStudioSubflowTrial } from "../../subflow-trial/index.ts";
import { subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { automationStudioCandidateTrialFeedback, runAutomationStudioCandidateTrial } from "../index.ts";
import { SPENT_TWO, trialFixture } from "./fixtures.ts";

const WHY = "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.";
const READING = { expected: "Every open slot on the course calendar, in date order.", observed: "Four slots stored; condition 1 keeps open slots.", advice: "Read the slots by their status column." };
const ADVISED: AutomationStudioBuildTestVerdict = { verdict: "not_judged", why: WHY, changeAdvised: true, answeredReading: { ...READING }, spent: { ...SPENT_TWO } };

/** What the builder is shown for a held yes that advised a change. */
function expectAdvised(feedback: Record<string, unknown>): void {
  expect(feedback).toMatchObject({ code: "candidate.trial_not_judged", why: WHY, answeredReading: READING });
  const advised = feedback.changeAdvised as Record<string, unknown>;
  // Codes first, then Core's words.
  expect(Object.keys(advised)).toEqual(["code", "said"]);
  expect(advised.code).toBe("candidate.trial_yes_change_advised");
  expect(advised.said).toContain("also that the Flow needs a change");
  expect(advised.said).toContain("answeredReading is what that call compared, and its advice the change it named");
  // The judge did not accept the Flow as it is: never the plain held yes's fact.
  expect(feedback).not.toHaveProperty("yesUnconfirmed");
}

describe("a not_judged after a held yes that advised a change (t636)", () => {
  const summary: AutomationStudioRunResultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 4, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [], flowShape: [], withheld: false };

  it("says so, codes first, beside that yes's reading and the change it named", () => {
    const { verdict, code, feedback } = automationStudioCandidateTrialFeedback.judged({ verdict: structuredClone(ADVISED), summary, trialRunId: "trial.1", start: "reset" });
    expect(verdict).toBe("not_judged");
    expect(code).toBe("candidate.trial_not_judged");
    expectAdvised(feedback);
  });

  it("adds nothing to any other not_judged: its feedback is as it was", () => {
    const plain = automationStudioCandidateTrialFeedback.judged({ verdict: { verdict: "not_judged", why: WHY, yesUnconfirmed: true, spent: { ...SPENT_TWO } }, summary, trialRunId: "trial.2", start: "reset" });
    expect(Object.keys(plain.feedback)).toEqual(["trialRunId", "start", "stored", "steps", "code", "why", "yesUnconfirmed", "provenance"]);
    expect(plain.feedback.provenance).toEqual({ why: "core_found" });
    expect(plain.feedback).not.toHaveProperty("changeAdvised");
    expect(plain.feedback).not.toHaveProperty("answeredReading");
  });

  it("reaches a candidate trial's result", async () => {
    const fixture = trialFixture();
    fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
    fixture.setVerdict(structuredClone(ADVISED));
    const { result } = await runAutomationStudioCandidateTrial(fixture.request(), fixture.ports);
    expect(result.verdict).toBe("not_judged");
    expectAdvised(result.feedback as Record<string, unknown>);
  });

  it("reaches a subflow trial's result", async () => {
    const fixture = subflowTrialFixture();
    fixture.setVerdict(structuredClone(ADVISED));
    const { result } = await runAutomationStudioSubflowTrial(fixture.request(), fixture.ports);
    expect(result.verdict).toBe("not_judged");
    expectAdvised(result.feedback as Record<string, unknown>);
  });
});
