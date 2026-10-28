// A stub-judge check of a result that stores no rows, through the verification
// (`../../../verify.ts`, t766). Since t752 a no counts only where it names a
// defect Core finds in its record, and before t766 that record held rows only:
// a Flow that only acts -- saves, sends, switches something on -- gave its
// judges nothing to name, so every no of it came to unsure, failed nothing and
// asked for no repair. A no naming an act missing, or a step that did its act
// wrong, is now found in Core's record of the steps the run took; a no naming
// nothing Core can find stays unsure. On the made-up library account of
// `../../../located-defects/tests/act-only-fixture.ts`. No model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { automationStudioResultVerificationFailsRun } from "../../../contracts/index.ts";
import { REMINDER_MISSING_NO, REMINDER_OTHER_NO, REMINDER_WRONG_NO, reminderInstruction, reminderRunSummary } from "../../../located-defects/tests/act-only-fixture.ts";
import { MIXED_ACT_NO, MIXED_ROW_NO, mixedInstruction, mixedRunSummary } from "../../../located-defects/tests/mixed-fixture.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../../verdict/index.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider answering each call with its own diagnosis, keeping every request it was sent. */
function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length];
        seen.push(request);
        if (!diagnosis) throw new Error("no call scripted");
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: reminderRunSummary(), instructions: [reminderInstruction()], deniedEvidenceKeys: [], provider });

describe("a no of a result that stores no rows, through the verification (t766)", () => {
  it("is a no that fails the run and carries a repair where it names an act no step did", async () => {
    const { provider, seen } = answering(REMINDER_MISSING_NO, REMINDER_MISSING_NO);
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    // Two calls, no re-ask: the act it names is found in Core's record.
    expect(seen).toHaveLength(2);
    expect(outcome).toMatchObject({ verdict: "does_not_answer", basis: "model", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.doesNotAnswer });
    expect(outcome.unsupportedNo).toBeUndefined();
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
    // The repair is handed what the judge saw and advised, and the act it named.
    expect(outcome.repair?.judgement).toMatchObject({ observed: REMINDER_MISSING_NO.observed, advice: REMINDER_MISSING_NO.changed, defects: REMINDER_MISSING_NO.defects });
  });

  it("is a no where it names a step the run took that did its act wrong", async () => {
    const { provider } = answering(REMINDER_WRONG_NO, REMINDER_WRONG_NO);
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "does_not_answer", basis: "model" });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
    expect(outcome.repair?.judgement?.defects).toEqual(REMINDER_WRONG_NO.defects);
  });

  it("stays unsure, failing nothing, where each no names nothing Core can find, even asked once more", async () => {
    const { provider, seen } = answering(REMINDER_OTHER_NO, REMINDER_OTHER_NO, REMINDER_OTHER_NO, REMINDER_OTHER_NO);
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(seen).toHaveLength(4);
    // The re-ask says how an act is named.
    expect(String(seen[2]?.context.resultSummary?.recheck)).toContain("act_missing for an act no step does");
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
    expect(outcome.repair).toBeUndefined();
  });
});

// A request that owes records and asks for an act beside them (t766, supervisor 2026-10-27): an act defect is grounded
// in Core's record of the steps the run took, evidence apart from the rows, so a mixed run's missing act is a no; a row
// claim of the same run still needs a row Core holds.
describe("a no of a run that owes records and must also act, through the verification (t766)", () => {
  const mixed = (provider: AutomationStudioLlmProvider) => verifyAutomationStudioRunResult({
    projectId: "project-1", flowId: "flow-1", runId: "run-2", summary: mixedRunSummary(), instructions: [mixedInstruction()], deniedEvidenceKeys: [], provider,
    requestedOutput: { parts: [{ part: "due-books", columns: ["title"] }] }
  });

  it("is a no that fails the run and carries a repair where it names the act no step did", async () => {
    const { provider, seen } = answering(MIXED_ACT_NO, MIXED_ACT_NO);
    const { outcome } = await mixed(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(seen).toHaveLength(2);
    expect(outcome).toMatchObject({ verdict: "does_not_answer", basis: "model", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.doesNotAnswer });
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
    expect(outcome.repair?.judgement).toMatchObject({ observed: MIXED_ACT_NO.observed, advice: MIXED_ACT_NO.changed, defects: MIXED_ACT_NO.defects });
  });

  it("stays unsure, failing nothing, where it claims a kept row Core does not hold, even asked once more", async () => {
    const { provider, seen } = answering(MIXED_ROW_NO, MIXED_ROW_NO, MIXED_ROW_NO, MIXED_ROW_NO);
    const { outcome } = await mixed(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(seen).toHaveLength(4);
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(outcome.unsupportedNo?.findings.join(" ")).toContain("is no row the result holds");
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
    expect(outcome.repair).toBeUndefined();
  });
});
