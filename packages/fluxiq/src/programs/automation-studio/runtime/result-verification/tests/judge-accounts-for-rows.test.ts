// A judge cannot pass rows that name the asked item, nor steer a repair with
// rows the result contradicts: live run `run-muw60j7c-bb7c9a62` (debug C-2, C-5).
//
// C-2: both build-test judges said yes though the name condition alone left out
// three pairs of earbuds sold with a charging case. A yes on a summary carrying
// `leftOutNamingTheItem` that does not name each of them is not a yes.
// C-5: the result judge said the Plus condition "alone excluded" B0J5MCMBAY and
// B07Z1RZGJG; both are in the stored result, and the re-author followed it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../build-test/index.ts";
import { automationStudioResultVerificationAgreement } from "../agreement.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";
import { automationStudioResultSummaryWithLeftOutNamingTheItem } from "../request-rows/index.ts";
import {
  RUN_MUW60J7C_PAIRS_LEFT_OUT, RUN_MUW60J7C_REQUEST, RUN_MUW60J7C_RESULT_JUDGE, RUN_MUW60J7C_TEST_JUDGE,
  runMuw60j7cRunSummary, runMuw60j7cTestSummary
} from "../request-rows/tests/run-muw60j7c.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../verdict.ts";
import { verifyAutomationStudioRunResult } from "../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const FINDING = AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem;

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The build test's summary as its judge is shown it. */
const flaggedTest = () => automationStudioResultSummaryWithLeftOutNamingTheItem(runMuw60j7cTestSummary(), [instruction]);

/** A provider that gives each call its reply in turn. */
function scripted(replies: readonly { summary: string; diagnosis: Record<string, unknown> }[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const reply = replies[Math.min(seen.length, replies.length - 1)]!;
        seen.push(request);
        return { response: { kind: "diagnosis", summary: reply.summary, diagnosis: reply.diagnosis }, usage: USAGE } as never;
      }
    }
  };
}

describe("a yes that does not account for the rows that name the asked item (C-2)", () => {
  it("is does_not_answer, with Core's finding and fix line naming the condition, the item, the rest and the rows", () => {
    const { summary, diagnosis } = RUN_MUW60J7C_TEST_JUDGE;
    const verification = automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: diagnosis as never, summaryText: summary, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    // The code the runtime routes a wrong answer to its re-author on (`recovery/refuted-result/reauthor.ts`).
    expect(verification.code).toBe(AUTOMATION_STUDIO_RESULT_VERDICT_CODES.doesNotAnswer);
    const finding = verification.repair?.findings.find((candidate) => candidate.code === FINDING);
    expect(finding?.detail).toContain("Step 10");
    expect(finding?.detail).toContain("\"name\"");
    expect(finding?.detail).toContain("\"wireless earbuds\"");
    expect(finding?.detail).toContain("\"charging cases\"");
    const fix = verification.repair?.fix.join("\n") ?? "";
    for (const row of RUN_MUW60J7C_PAIRS_LEFT_OUT) expect(fix).toContain(row);
    expect(fix).toContain("\"name\"");
    expect(verification.repair?.checked?.join("\n")).toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[0]);
    expect(verification.failure?.expected).toContain("Lumo Audio Drift Pro");
  });

  it("stands when the reply names each row, by a prefix that tells it apart or by an id", () => {
    const observed = [
      "Lumo Audio Drift Pro and Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case are earbuds the request excludes because ...",
      "Aurelle Pods Fit Wireless Earbuds, Bluetooth 5.3 Headphones with 36H Playtime, Touch Control, Built-in Mic, Ivory with Wireless Charging Case is excluded because ..."
    ].join(" ");
    const verification = automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: { answersRequest: "yes", observed }, basis: "model" });
    expect(verification.verdict).toBe("answers");
  });

  it("is still does_not_answer when one row goes unnamed, and names only that row", () => {
    const observed = "Lumo Audio Drift Pro and Trevio T5 Wireless Earbuds, Bluetooth 5.3 Headphones with 30H Playtime, Wireless Charging Case are excluded.";
    const verification = automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: { answersRequest: "yes", observed }, basis: "model" });
    expect(verification.verdict).toBe("does_not_answer");
    const fix = verification.repair?.fix.join("\n") ?? "";
    expect(fix).toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[1]);
    expect(fix).not.toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[0]);
  });

  it("counts as a no in the pair rules: two such yeses refute", () => {
    const { diagnosis } = RUN_MUW60J7C_TEST_JUDGE;
    const once = () => automationStudioResultVerdict({ summary: flaggedTest(), diagnosis: diagnosis as never, basis: "model" });
    const outcome = automationStudioResultVerificationAgreement({ first: once(), second: once(), confirmAnswer: true });
    expect(outcome.verdict).toBe("does_not_answer");
    expect(outcome.calls).toBe(2);
  });

  it("the build-test judge sent the run's two yeses answers no, with the finding, through the real verify", async () => {
    const { provider, seen } = scripted([RUN_MUW60J7C_TEST_JUDGE, RUN_MUW60J7C_TEST_JUDGE]);
    const judge = automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
    const verdict = await judge({ summary: runMuw60j7cTestSummary(), budget: { maxCostUsd: 0.2 } });
    expect(seen).toHaveLength(2);
    // Both kinds of judge are shown the rows.
    expect(seen[0]?.context.resultSummary?.leftOutNamingTheItem?.[0]?.rows).toEqual(RUN_MUW60J7C_PAIRS_LEFT_OUT);
    expect(verdict).toMatchObject({ verdict: "no", findings: expect.arrayContaining([FINDING]) });
    expect(verdict.verdict === "no" ? verdict.checked?.join("\n") : "").toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[2]);
  });
});

describe("a no whose rows the result contradicts (C-5)", () => {
  it("carries Core's check: B0J5MCMBAY and B07Z1RZGJG are in the result, so advice resting on that reading is not supported", async () => {
    const { provider, seen } = scripted([RUN_MUW60J7C_RESULT_JUDGE, RUN_MUW60J7C_RESULT_JUDGE]);
    const report = await verifyAutomationStudioRunResult({
      projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: runMuw60j7cRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider
    });
    expect(report.outcome.performed && report.outcome.verdict).toBe("does_not_answer");
    const checked = report.outcome.performed ? report.outcome.repair?.checked ?? [] : [];
    const misread = checked.filter((line) => line.includes("the check misread which rows were left out; advice resting on that reading is not supported"));
    expect(misread.join("\n")).toContain("(B0J5MCMBAY) is in the result");
    expect(misread.join("\n")).toContain("(B07Z1RZGJG) is in the result");
    // The result judge is shown the flagged rows too.
    expect(seen[0]?.context.resultSummary?.leftOutNamingTheItem?.[0]?.rows).toEqual(RUN_MUW60J7C_PAIRS_LEFT_OUT);
  });
});
