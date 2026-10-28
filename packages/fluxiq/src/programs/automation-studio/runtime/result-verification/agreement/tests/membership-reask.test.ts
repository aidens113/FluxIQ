// A double no whose every defect only restates the value one condition tested
// and left a row out for, which the request does not say, names no defect Core
// finds (t785, `../../located-defects/tested-value-only.ts`): so
// `../unsupported-no.ts` asks each no once more, with Core's finding, and two
// yeses answer the request. Run `run-mvskodlp-9966d618`'s shape, where such a
// double no stood and a correct result was refuted. On the made-up club board
// of `../../located-defects/tests/club-posts-fixture.ts`; no model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { automationStudioResultVerificationFailsRun } from "../../contracts/index.ts";
import { CLUB_POSTS_YES, TESTED_CLUB_NO, clubPostsInstruction, clubPostsRunSummary } from "../../located-defects/tests/club-posts-fixture.ts";
import { verifyAutomationStudioRunResult } from "../../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
/** How the re-ask of a no that names no defect Core finds opens (`../unsupported-no.ts`, `recheckWords`). */
const RECHECK = "that answer said the result does not answer the request, but named no defect Core can find in this result";

describe("a double no restating only the value a condition tested (t785)", () => {
  it("is asked once more per no with Core's finding, and two yeses answer", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        const recheck = String(request.context.resultSummary?.recheck ?? "");
        const diagnosis = recheck.includes(RECHECK) ? CLUB_POSTS_YES : TESTED_CLUB_NO;
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    };
    const { outcome } = await verifyAutomationStudioRunResult({
      projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: clubPostsRunSummary(), instructions: [clubPostsInstruction()], deniedEvidenceKeys: [], provider
    });
    if (!outcome.performed) throw new Error("not performed");
    const rechecks = seen.map((request) => String(request.context.resultSummary?.recheck ?? "")).filter((recheck) => recheck.includes(RECHECK));
    expect(rechecks).toHaveLength(2);
    for (const recheck of rechecks) expect(recheck).toContain("the value condition 1 (club equals [\"A Club\", \"B Club\"]) tested and left out as written; the request does not say \"C Club\"");
    expect(outcome.verdict).toBe("answers");
    expect(outcome.unsupportedNo).toBeUndefined();
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
  });
});
