// The yes a build finished on, kept as a record (live run run-musp8nz1-dbd3905a,
// cause R2: "finished on a judged yes about the standing Flow" was provable only
// from core.log order), and a yes's advice kept as unconfirmed, never a repair
// directive (run-murwd8le-79e735a8, cause 10: a yes with patchNeeded true advised
// "Remove or reorder step 11", which would have broken the Flow). Judges are
// scripted: no provider.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  automationStudioFlowBootstrapFinishingVerdict,
  automationStudioFlowBootstrapFinishingVerdictDetail,
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapBuildPhasesInput,
  type AutomationStudioFlowBootstrapRoundRequest,
  type AutomationStudioFlowBootstrapTestVerdict
} from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";
const JUDGE_SPEND = { inputTokens: 3_000, outputTokens: 200, totalTokens: 3_200, estimatedCostUsd: 0.004 };
const WRONG_ADVICE = "Step 11 re-clicks Space Grey after the quantity was set, which could deselect the variant. Remove or reorder step 11.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

function wholeFlow(): AutomationStudioFlowDraftStep[] {
  return [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })];
}

function finished(steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: true, result: { summary: "Adds and saves." }, trace: [{ iteration: 1, decision: "tool_call", toolId: "web.dom.click" }, { iteration: 2, decision: "complete" }], steps,
    accounting: { iterations: 2, toolCalls: 2, evidenceBytes: 100, inputTokens: 2_000, cacheHitInputTokens: 0, outputTokens: 200, totalTokens: 2_200, estimatedCostUsd: 0.03 }
  };
}

const digest = (signature: string) => `sha256:${createHash("sha256").update(signature).digest("hex")}`;

function harness(
  rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>,
  verdicts: Array<(signature: string) => AutomationStudioFlowBootstrapTestVerdict>
) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  let judgedCount = 0;
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => {
      requests.push(request);
      const next = rounds[requests.length - 1];
      if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
      return next(request);
    },
    judge: async ({ loop }) => {
      const next = verdicts[judgedCount++];
      if (!next) throw new Error(`no verdict ${judgedCount - 1} scripted`);
      return next(automationStudioFlowDraftFlowSignature(loop.steps));
    },
    test: async () => undefined,
    replayable: (steps) => steps.length > 0 && steps.every((each) => each.replay !== undefined),
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.25, maxDurationMs: 540_000 },
    maxIterations: 64,
    keep: async (...args) => ({ revision: 1, steps: (args[2] as unknown[]).length }),
    now: () => 0
  };
  return { input, requests };
}

describe("the yes a build finished on, on record", () => {
  it("records the verdict, its confidence, the judged and the standing Flow's signature digests, and that they match", async () => {
    const { input } = harness([() => finished(wholeFlow())], [(signature) => ({ verdict: "yes", spent: JUDGE_SPEND, flowSignature: signature, confidence: 0.9 })]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    const standing = digest(automationStudioFlowDraftFlowSignature(wholeFlow()));
    expect(outcome.finishing).toEqual({ verdict: "yes", round: 0, judgedAt: "finished_round", flowSignature: standing, standingFlowSignature: standing, matchesStandingFlow: true, confidence: 0.9 });
    // A digest, never the signature itself: that holds every step's input and target.
    expect(JSON.stringify(outcome.finishing)).not.toContain("quantity");
  });

  it("keeps a yes's advice and patchNeeded as unconfirmed, and finishes on the yes without repairing on it", async () => {
    const { input, requests } = harness([() => finished(wholeFlow())], [(signature) => ({ verdict: "yes", spent: JUDGE_SPEND, flowSignature: signature, confidence: 0.7, unconfirmedAdvice: { advice: WRONG_ADVICE, patchNeeded: true } })]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.finishing?.unconfirmed).toEqual({ advice: WRONG_ADVICE, patchNeeded: true });
    expect(outcome.finishing?.matchesStandingFlow).toBe(true);
    // The proposal's record is plain JSON, with the advice only under `unconfirmed`.
    const detail = automationStudioFlowBootstrapFinishingVerdictDetail(outcome.finishing!);
    expect(JSON.parse(JSON.stringify(detail))).toEqual(detail);
    expect(Object.keys(detail)).not.toContain("advice");
    expect(detail.unconfirmed).toEqual({ advice: WRONG_ADVICE, patchNeeded: true });
  });

  it("never hands a yes's advice to the repair a yes about another Flow sends back, and records only the yes the build finished on", async () => {
    const { input, requests } = harness(
      [() => finished(wholeFlow()), (request) => finished(request.repair!.seed.map((each) => ({ ...each })))],
      [
        () => ({ verdict: "yes", spent: JUDGE_SPEND, flowSignature: "another Flow", unconfirmedAdvice: { advice: WRONG_ADVICE, patchNeeded: true } }),
        (signature) => ({ verdict: "yes", spent: JUDGE_SPEND, flowSignature: signature })
      ]
    );

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    const repair = requests[1]!.repair!;
    expect((repair.resume.judgement as { judge?: { verdict?: string } } | undefined)?.judge?.verdict).toBe("not_judged");
    expect(JSON.stringify(repair)).not.toContain("step 11");
    expect(JSON.stringify(repair)).not.toContain("patchNeeded");
    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.finishing).toMatchObject({ round: 1, judgedAt: "finished_round", matchesStandingFlow: true });
    expect(outcome.finishing?.unconfirmed).toBeUndefined();
  });

  it("records a yes about another Flow, or about no test, as not matching, and drops a confidence out of range and empty advice", () => {
    const steps = wholeFlow();
    expect(automationStudioFlowBootstrapFinishingVerdict({ verdict: { verdict: "yes", spent: JUDGE_SPEND }, round: 2, judgedAt: "judging_reserve", steps })).toEqual({
      verdict: "yes", round: 2, judgedAt: "judging_reserve", flowSignature: null, standingFlowSignature: digest(automationStudioFlowDraftFlowSignature(steps)), matchesStandingFlow: false
    });
    const other = automationStudioFlowBootstrapFinishingVerdict({ verdict: { verdict: "yes", spent: JUDGE_SPEND, flowSignature: "x", confidence: 7, unconfirmedAdvice: { advice: "  " } }, round: 0, judgedAt: "finished_round", steps });
    expect(other.matchesStandingFlow).toBe(false);
    expect(other.flowSignature).toBe(digest("x"));
    expect(other).not.toHaveProperty("confidence");
    expect(other).not.toHaveProperty("unconfirmed");
  });
});
