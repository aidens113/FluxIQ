// A stub-judge replay of social r4 `run-mvfq957o-40103539` 0084-0086 (t725)
// through the verification (`../../../verify.ts`): a split whose no names no
// defect is asked once more, its call charged to the Flow's purse like every
// other, and a yes there confirms; a no that names a real defect stands as a
// split. On the made-up recipe archive of `../../../agreement/tests/recipe-split-fixture.ts`:
// no task, site, item or answer of any realistic scenario. No model is called.
import { describe, expect, it } from "vitest";
import { AutomationStudioLlmBuildPurse, automationStudioLlmFlowPurseScope } from "../../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK } from "../../../agreement/index.ts";
import { RECIPE_DEFECT_NO, RECIPE_HYPOTHETICAL_NO, RECIPE_YES, recipeInstruction, recipeRunSummary } from "../../../agreement/tests/recipe-split-fixture.ts";
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
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary: recipeRunSummary(), instructions: [recipeInstruction()], deniedEvidenceKeys: [], provider, confirmAnswer: true });

describe("a split's no that names no defect, through the verification (t725)", () => {
  it("is asked once more with the defect words, charged to the Flow's purse, and two yeses confirm", async () => {
    const charged: number[] = [];
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, carriedUsd: 0, onSettled: (usd) => charged.push(usd) });
    const { provider, seen } = answering(RECIPE_HYPOTHETICAL_NO, RECIPE_YES, RECIPE_YES);
    const report = await automationStudioLlmFlowPurseScope(flow, async () => await verify(provider));
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 3, verdicts: ["does_not_answer", "answers", "answers"] });
    expect(seen).toHaveLength(3);
    expect(JSON.stringify(seen[2])).toContain(JSON.stringify(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK).slice(1, 80));
    expect(JSON.stringify(seen[1])).not.toContain(JSON.stringify(AUTOMATION_STUDIO_RESULT_SPLIT_NO_RECHECK).slice(1, 80));
    expect(report.interventions).toHaveLength(3);
    expect(report.interventions[2]?.metadata).toMatchObject({ verificationCheck: 1, verificationReask: true });
    // The extra call is the same purse's: three calls settle, each at what it reported.
    expect(flow.spentCalls()).toBe(3);
    expect(charged).toHaveLength(3);
  });

  it("stays a split where the re-asked call names a real defect, asked only once", async () => {
    const { provider, seen } = answering(RECIPE_HYPOTHETICAL_NO, RECIPE_YES, RECIPE_DEFECT_NO);
    const report = await verify(provider);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", calls: 3 });
    expect(seen).toHaveLength(3);
  });

  it("asks nothing more where both calls agree", async () => {
    const { provider, seen } = answering(RECIPE_HYPOTHETICAL_NO, RECIPE_DEFECT_NO);
    const report = await verify(provider);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
    expect(seen).toHaveLength(2);
  });
});
