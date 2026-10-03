// A build whose model replies kept arriving unreadable ends as exactly that: a
// message saying what happened and how many tries, never a bare code (t211).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { parseAutomationStudioFlowBootstrapBuildEnding } from "../../generation-failure/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapBuildPhasesInput } from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";

function step(position: number, acts: string[]): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, acts
  };
}

function unreadable(steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.unreadable_replies", trace: [{ iteration: 14, decision: "unusable", resultCode: "llm.provider_malformed_response", resultReason: "content_mismatched" }], steps,
    accounting: { iterations: 14, toolCalls: 6, evidenceBytes: 100, inputTokens: 14_000, cacheHitInputTokens: 0, outputTokens: 5_000, totalTokens: 19_000, estimatedCostUsd: 0.03 },
    unreadable: { inARow: 6, total: 8, cases: ["content_mismatched", "content_unclosed"], said: "its brackets did not match: one closed the wrong kind, or there was one too many or too few" }
  };
}

function phases(round: () => AutomationStudioLlmEvidenceLoopResult) {
  const rounds: number[] = [];
  const tested: unknown[] = [];
  const kept: unknown[][] = [];
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => { rounds.push(request.round); return round(); },
    test: async (steps) => { tested.push(steps); return undefined; },
    replayable: (steps) => steps.length > 0,
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.25, maxDurationMs: 540_000 },
    maxIterations: 64,
    keep: async (...args) => { kept.push(args); return { revision: 1, steps: (args[2] as unknown[]).length }; },
    now: () => 0
  };
  return { input, rounds, tested, kept };
}

describe("a build whose model replies kept arriving unreadable", () => {
  it("ends with a message saying so, how many tries it took, what is done and what was kept -- and runs nothing more", async () => {
    const { input, rounds, tested, kept } = phases(() => unreadable([step(1, ["a1"])]));

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    // No second round and no test: the build is ending, and its replies are what failed.
    expect(rounds).toEqual([0]);
    expect(tested).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(outcome.ending).toMatchObject({ kind: "replies_unreadable", tried: { rounds: 1, decisions: 14, stepsInFlow: 1, tested: "not_tested" } });
    expect(outcome.ending.notDone.map((item) => item.id)).toEqual(["a1.quantity", "a2"]);
    const message = outcome.ending.message;
    expect(message).toMatch(/^The build stopped because the model's replies could not be read: 6 in a row came back unreadable -- most often because its brackets did not match/u);
    expect(message).toContain("each was asked again with a note of what was wrong.");
    expect(message).toContain("In all, 8 of 14 replies could not be read, over one live round; each was paid for and counted in the build's budget.");
    expect(message).toContain("1 of the 3 things you asked has a step in the Flow, not yet shown to work by running it; still to do:");
    expect(message).toContain("The Flow so far was kept as a draft, not put into the Flow, and building again carries on from it.");
    expect(message).not.toMatch(/llm\.|_/u);
    // The round's rows are published with the ending, and its spend with them:
    // they were left out when this ending and the whole-build record first met (t214).
    expect(outcome.progress.trace).toEqual([{ iteration: 14, decision: "unusable", resultCode: "llm.provider_malformed_response", resultReason: "content_mismatched" }]);
    expect(outcome.progress.accounting).toMatchObject({ iterations: 14, totalTokens: 19_000 });
  });

  it("is published under its own code, and reads back", async () => {
    const { input } = phases(() => unreadable([]));
    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);
    if (outcome.kind !== "unfinished") throw new Error("expected an unfinished build");
    expect(parseAutomationStudioFlowBootstrapBuildEnding(outcome.ending, "flow_bootstrap.model_replies_unreadable")).toEqual(outcome.ending);
    expect(parseAutomationStudioFlowBootstrapBuildEnding(outcome.ending, "flow_bootstrap.not_doable")).toBeNull();
    expect(outcome.ending.message).toContain("No step I found belonged in the Flow.");
  });
});
