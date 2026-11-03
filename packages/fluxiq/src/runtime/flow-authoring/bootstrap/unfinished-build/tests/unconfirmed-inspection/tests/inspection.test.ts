import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../../../draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../../../../agents/llm/index.ts";
import type { AutomationStudioResultVerification } from "../../../../../../result-verification/contracts/index.ts";
import { automationStudioBuildTestJudge } from "../../../../../../result-verification/build-test/index.ts";
import { inspectionFixture } from "../../../../../../result-verification/unconfirmed-inspection/tests/fixture.ts";
import { automationStudioFlowBootstrapJudgeFinished, automationStudioFlowBootstrapJudgementValue } from "../../../judgement.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapBuildPhasesInput, type AutomationStudioFlowBootstrapRoundRequest, type AutomationStudioFlowBootstrapTestVerdict } from "../../../index.ts";

const SPENT = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
function steps(): AutomationStudioFlowDraftStep[] {
  return [{ position: 1, id: "read", iteration: 1, callId: "read-call", actionId: "list.read", input: {}, effect: "observe", effectApplied: true, disposition: "kept", proposes: true, replay: { from: { at: "start" } }, replayed: { step: 1, actionId: "list.read", status: "replayed" } }];
}

function harness(overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const judge = automationStudioBuildTestJudge({ instructions: [inspectionFixture.instruction], projectId: "project", flowId: "flow", deniedEvidenceKeys: [], verify: (request) => inspectionFixture.report(request.summary) });
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request): Promise<AutomationStudioLlmEvidenceLoopResult> => {
      requests.push(request);
      return { ok: true, result: { summary: "Reads the list." }, trace: [], steps: steps(), accounting: { iterations: 1, toolCalls: 1, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0.01 } };
    },
    judge: async ({ round, loop }) => round === 0
      ? { verdict: "no", findings: ["result.missing_row"], spent: SPENT }
      : { ...await judge({ summary: inspectionFixture.summary() }), flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) },
    test: async () => undefined, replayable: () => true, checklist: () => undefined, keep: async () => undefined,
    maxIterations: 20, budget: { maxCostUsd: 1, maxDurationMs: 60_000 }, now: () => 0, ...overrides
  };
  return { input, requests };
}

describe("an unconfirmed evidence inspection in a stalled build", () => {
  it("reaches the model as unconfirmed, grants one repair, then stops without acceptance on a second stall", async () => {
    const { input, requests } = harness();
    const result = await runAutomationStudioFlowBootstrapBuildPhases(input);
    expect(requests).toHaveLength(3);
    expect(result).toMatchObject({ kind: "unfinished", ending: { kind: "not_finished", tried: { noRoute: { kind: "no_progress" } } } });
    expect(requests[2]?.repair?.resume?.judgement).toMatchObject({ judge: { verdict: "unknown", unconfirmedInspection: { status: "unconfirmed", requiresFreshRead: true, instruction: expect.stringContaining("freshly read"), claims: [{ call: 1 }, { call: 2 }] } } });
    const serialized = JSON.stringify(requests[2]?.repair?.resume?.judgement);
    expect(serialized).toContain("allegations, not findings");
    expect(serialized).not.toContain("Remove the status condition without checking it.");
    expect(serialized).not.toContain('"advice"');
    expect(serialized).not.toContain('"stillAchievable"');
  });

  it("does not grant the grace for an unknown without a hint, a forged hint or not_judged", async () => {
    const forged: NonNullable<AutomationStudioResultVerification["unconfirmedInspection"]> = { status: "unconfirmed", reason: "row_cell_unmeasured", requiresFreshRead: true, claims: [] };
    const verdicts: AutomationStudioFlowBootstrapTestVerdict[] = [
      { verdict: "unknown", why: "Not settled.", spent: SPENT },
      { verdict: "unknown", why: "Not settled.", unconfirmedInspection: forged, spent: SPENT },
      { verdict: "not_judged", why: "Not run.", unconfirmedInspection: forged, spent: SPENT }
    ];
    for (const verdict of verdicts) {
      const { input, requests } = harness({ judge: async ({ round, loop }) => round === 0 ? { verdict: "no", findings: ["result.missing_row"], spent: SPENT } : { ...verdict, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) } });
      expect(await runAutomationStudioFlowBootstrapBuildPhases(input)).toMatchObject({ kind: "unfinished", ending: { kind: "not_finished" } });
      expect(requests).toHaveLength(2);
    }
  });

  it("does not reuse a genuine hint on a later round or another Flow, including serialization", async () => {
    let remembered: AutomationStudioFlowBootstrapTestVerdict | undefined;
    const normal = harness();
    const realJudge = normal.input.judge;
    if (!realJudge) throw new Error("no judge");
    normal.input.judge = async (request) => {
      const verdict = await realJudge(request);
      if (request.round === 1) remembered = verdict;
      return verdict;
    };
    await runAutomationStudioFlowBootstrapBuildPhases(normal.input);
    if (!remembered || remembered.verdict !== "unknown") throw new Error("no unknown captured");
    const verdict = remembered;
    for (const { round, current } of [{ round: 2, current: steps() }, { round: 1, current: [{ ...steps()[0]!, input: { changed: true } }] }]) {
      const { judgement } = automationStudioFlowBootstrapJudgeFinished({ round, steps: current, verdict, checklist: () => undefined });
      expect(judgement.judge).not.toHaveProperty("unconfirmedInspection");
      expect(automationStudioFlowBootstrapJudgementValue(judgement).judge).not.toHaveProperty("unconfirmedInspection");
    }
    const repeated = harness({ judge: async ({ round }) => round === 0 ? { verdict: "no", findings: ["result.missing_row"], spent: SPENT } : verdict });
    expect(await runAutomationStudioFlowBootstrapBuildPhases(repeated.input)).toMatchObject({ kind: "unfinished", ending: { kind: "not_finished" } });
    expect(repeated.requests).toHaveLength(2);
  });

  it("does not turn advice beside a yes about no current test into another repair", async () => {
    const { input, requests } = harness({ judge: async ({ round }) => round === 0 ? { verdict: "no", findings: ["result.missing_row"], spent: SPENT } : { verdict: "yes", spent: SPENT, unconfirmedAdvice: { advice: "Change the condition without inspecting it.", patchNeeded: true } } });
    expect(await runAutomationStudioFlowBootstrapBuildPhases(input)).toMatchObject({ kind: "unfinished", ending: { kind: "not_finished" } });
    expect(requests).toHaveLength(2);
  });

  it("still stops at the duration/cost bound and passes cancellation through", async () => {
    for (const budget of [{ maxCostUsd: 0.02, maxDurationMs: 60_000 }, { maxCostUsd: 1, maxDurationMs: 1 }]) {
      const { input, requests } = harness({ budget });
      const result = await runAutomationStudioFlowBootstrapBuildPhases(input);
      expect(result).toMatchObject({ kind: "unfinished", ending: { kind: "budget_exhausted" } });
      expect(requests.length).toBeLessThan(3);
    }
    const { input } = harness({ judge: async () => { throw new DOMException("Cancelled", "AbortError"); } });
    expect(await runAutomationStudioFlowBootstrapBuildPhases(input)).toMatchObject({ kind: "ended", loop: { code: "llm_evidence_loop.cancelled" } });
  });
});
