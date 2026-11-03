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
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../verdict/index.ts";
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

// t790, run `run-mvswewhy-e4e469d4`: both calls said no naming nothing Core
// finds; asked once more, call 1 said yes and call 2 said no again, still
// naming nothing Core finds. The lone-yes confirming ask was unreachable from
// a double no, so the outcome was unsure with nothing asked. It is now asked
// in call 2's place: a second yes answers; anything else stays unsure.
/** How the one confirming ask of a lone yes opens (`../unsupported-no.ts`, `CONFIRM_LONE_YES`). */
const CONFIRMING = "one check answered that the result does what the request asks, and every check that answered no named no defect Core can find";
/** A no naming no defect at all. */
const LISTED_NONE_NO = { ...TESTED_CLUB_NO, defects: [] };

/**
 * A judge saying no on both first asks; its first recheck answers `first`, its
 * second `second`, and the confirming ask `confirm`; anything else is the no.
 */
function judge(answers: { first: Record<string, unknown>; second: Record<string, unknown>; confirm?: Record<string, unknown> }): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  let rechecks = 0;
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        const recheck = String(request.context.resultSummary?.recheck ?? "");
        const diagnosis = recheck.includes(CONFIRMING) ? answers.confirm ?? TESTED_CLUB_NO
          : recheck.includes(RECHECK) ? (++rechecks === 1 ? answers.first : answers.second)
            : TESTED_CLUB_NO;
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: clubPostsRunSummary(), instructions: [clubPostsInstruction()], deniedEvidenceKeys: [], provider });

/** The check each confirming ask was made on, as its intervention records it (`../../verify.ts`). */
function confirmingChecks(report: Awaited<ReturnType<typeof verifyAutomationStudioRunResult>>, seen: readonly AutomationStudioLlmTaskRequest[]): unknown[] {
  expect(report.interventions).toHaveLength(seen.length);
  return seen.flatMap((request, index) => (String(request.context.resultSummary?.recheck ?? "").includes(CONFIRMING) ? [report.interventions[index]!.metadata?.verificationCheck] : []));
}

describe("a double no whose re-asks split, beside a no Core still refuses (t790)", () => {
  it("asks the lone yes once more in the refused no's place, and a second yes answers", async () => {
    const { provider, seen } = judge({ first: CLUB_POSTS_YES, second: TESTED_CLUB_NO, confirm: CLUB_POSTS_YES });
    const report = await verify(provider);
    const { outcome } = report;
    if (!outcome.performed) throw new Error("not performed");
    expect(confirmingChecks(report, seen)).toEqual([2]);
    expect(outcome.verdict).toBe("answers");
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(false);
  });

  it("stays unsure where the confirming ask says no, saying the re-asked no named one defect Core cannot find", async () => {
    const { provider, seen } = judge({ first: CLUB_POSTS_YES, second: TESTED_CLUB_NO, confirm: TESTED_CLUB_NO });
    const report = await verify(provider);
    const { outcome } = report;
    if (!outcome.performed) throw new Error("not performed");
    expect(confirmingChecks(report, seen)).toEqual([2]);
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(outcome.unsupportedNo?.calls).toEqual([2]);
    expect(outcome.reason).toContain("Asked once more to list each, it named one defect, which Core cannot find in its record, so that no is not taken.");
  });
});

describe("the unsure reason after a no is asked once more (t790)", () => {
  it("says a re-asked no that listed no defect named none", async () => {
    const { provider } = judge({ first: CLUB_POSTS_YES, second: LISTED_NONE_NO });
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome).toMatchObject({ verdict: "unsure", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(outcome.reason).toContain("Asked once more to list each, it named none, so that no is not taken.");
  });

  it("says what each of two re-asked nos named, and asks no confirming call", async () => {
    const { provider, seen } = judge({ first: LISTED_NONE_NO, second: TESTED_CLUB_NO });
    const report = await verify(provider);
    const { outcome } = report;
    if (!outcome.performed) throw new Error("not performed");
    expect(confirmingChecks(report, seen)).toEqual([]);
    expect(outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.refutationUnsupported });
    expect(outcome.unsupportedNo?.calls).toEqual([1, 2]);
    expect(outcome.reason).toContain("Asked once more to list each, the first named none and the second named one defect, which Core cannot find in its record, so neither no is taken.");
  });

  it("says so once where both re-asked nos named the same", async () => {
    const { provider } = judge({ first: TESTED_CLUB_NO, second: TESTED_CLUB_NO });
    const { outcome } = await verify(provider);
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome.reason).toContain("Asked once more to list each, each named one defect, which Core cannot find in its record, so neither no is taken.");
  });
});
