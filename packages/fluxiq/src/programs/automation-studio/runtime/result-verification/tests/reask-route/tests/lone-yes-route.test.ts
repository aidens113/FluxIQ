// A lone yes beside nos Core refused every one of, through the verification
// (t771, lead decision 2026-10-27). Rerun round 6 social
// `run-mvrj7qg8-c20c132e`, trial 4: the run stored exactly the rows asked for;
// one call said yes, the other said no over a friend's own post it gave a
// group, and that no, asked again, still named only rows Core could not find.
// The outcome was unsure by rule, and the build never learned its answer was
// right. Such a yes is now asked once more: a second yes stands, anything else
// is unsure. And nothing of a no Core could not ground -- what it observed or
// advised -- is carried on. On the made-up notice board of
// `../../../located-defects/tests/club-notices-fixture.ts`; no model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { automationStudioResultVerificationFailsRun } from "../../../contracts/index.ts";
import { INVENTED_CLUB_NO, NOTICE_YES, noticeInstruction, noticeRunSummary } from "../../../located-defects/tests/club-notices-fixture.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../../verdict/index.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
/** How the one confirming ask of a lone yes opens (`../../../agreement/unsupported-no.ts`). */
const CONFIRMING = "one check answered that the result does what the request asks, and every check that answered no named no defect Core can find";

/**
 * A judge whose first call says no and second says yes; asked again, it says
 * no, except on the confirming ask of a lone yes, where it says `confirm`.
 */
function judge(confirm: Record<string, unknown>): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        const recheck = String(request.context.resultSummary?.recheck ?? "");
        const diagnosis = seen.length === 2 ? NOTICE_YES : recheck.includes(CONFIRMING) ? confirm : INVENTED_CLUB_NO;
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: noticeRunSummary(), instructions: [noticeInstruction()], deniedEvidenceKeys: [], provider });

describe("a lone yes beside nos Core refused every one of (t771)", () => {
  it("is asked once more, and a second yes stands as yes", async () => {
    const { provider, seen } = judge(NOTICE_YES);
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(seen.filter((request) => String(request.context.resultSummary?.recheck ?? "").includes(CONFIRMING))).toHaveLength(1);
    expect(outcome.verdict).toBe("answers");
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
  });

  it("stays unsure where the confirming ask does not say yes, carrying nothing the refused no observed or advised", async () => {
    const { provider } = judge(INVENTED_CLUB_NO);
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(outcome.unconfirmedReading?.observed).toBeUndefined();
    expect(outcome.unconfirmedReading?.advice).toBeUndefined();
    expect(JSON.stringify(outcome)).not.toContain(INVENTED_CLUB_NO.changed);
    expect(outcome.unsupportedNo?.findings.join(" ")).toContain("not \"Chess Club\"");
  });
});

describe("a double no Core refused every defect of (t771)", () => {
  it("is unsure, asks no confirming call, and carries nothing either no observed or advised", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: INVENTED_CLUB_NO }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    };
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(seen.some((request) => String(request.context.resultSummary?.recheck ?? "").includes(CONFIRMING))).toBe(false);
    expect(outcome.unconfirmedReading).toEqual({ expected: INVENTED_CLUB_NO.expected });
  });
});
