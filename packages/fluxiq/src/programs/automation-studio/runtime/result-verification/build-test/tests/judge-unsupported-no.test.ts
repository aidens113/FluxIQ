// A no that names no defect Core can find, asked once more and still naming
// none, is never a no (t752, `../../agreement/unsupported-no.ts`): the build's
// test reads it as unknown, with the no's reading and Core's record of the
// trial, and says so as a field. `verify` is injected; no model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioResultVerificationReport } from "../../verify.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../verdict/index.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import { LOAN_REQUEST, loanRunSummary } from "../../agreement/tests/loan-fixture.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: LOAN_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const STANDING = { stored: [], storedWhole: true, conditions: [], standing: [] };

const unsupported: AutomationStudioResultVerificationReport = {
  interventions: [],
  outcome: {
    schemaVersion: "automation-studio.result-verification.v1", performed: true,
    verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported,
    reason: "Both checks answered no without naming a defect Core can find in this result.", observation: "3 records stored.",
    verdicts: ["does_not_answer", "does_not_answer", "does_not_answer", "does_not_answer"], calls: 4,
    unsupportedNo: { calls: [1, 2], findings: ["Judge call 1 listed no defect."], reasked: true },
    unconfirmedReading: { observed: "Judge call 1 (no defect Core can find in this result): the method is fragile.", advice: "Judge call 1 (no defect Core can find in this result): compare dates." },
    standingNo: STANDING
  }
};

describe("the build test's judge over a no that names no defect Core can find (t752)", () => {
  it("is unknown, never no, with the reading, Core's record of the trial, and the fact as a field", async () => {
    const judge = automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", verify: async () => unsupported });
    const verdict = await judge({ summary: loanRunSummary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "unknown", unsupportedNo: true, unconfirmedReading: { advice: expect.stringContaining("compare dates") } });
    expect(verdict.verdict === "unknown" && verdict.standingNo).toEqual(STANDING);
  });
});
