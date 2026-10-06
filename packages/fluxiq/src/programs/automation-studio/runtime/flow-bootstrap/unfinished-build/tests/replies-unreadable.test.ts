// A build whose model replies kept arriving unreadable ends as exactly that: a
// message saying what happened and how many tries, never a bare code (t211).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { parseAutomationStudioFlowBootstrapBuildEnding } from "../../generation-failure/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapBuildPhasesInput } from "../index.ts";
import { automationStudioFlowBootstrapRepliesUnreadable } from "../replies-unreadable.ts";

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
    expect(message).toMatch(/^The build stopped because the replies it got back could not be read: 6 in a row came back unreadable -- most often because its brackets did not match/u);
    expect(message).toContain("and it asked again each time, with a note of what was wrong.");
    expect(message).toContain("In all, 8 of 14 replies could not be read; each was paid for and counted in the build's budget.");
    // In a person's words (t195-w48), and one live round is not said again as a count.
    expect(message).not.toMatch(/\bmodel\b|\bround\b|I worked on it live/u);
    expect(message).toContain("1 of the 3 things you asked has a step in the Flow, not yet shown to work by running it; still to do:");
    expect(message).toContain("The steps I found so far were kept as a draft, so building again carries on from them.");
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

// t193 round 1003 (w9): the progress and the last test said once, never "not judged" twice.
describe("an unreadable-replies ending after a judged test", () => {
  it("says the Flow was not judged once, with its step count in the progress sentence", () => {
    const checklist = [{ id: "a1", verb: "add", quote: "add two packs", done: 1 }, { id: "a2", verb: "save", quote: "save the kettle", done: 2 }];
    const message = automationStudioFlowBootstrapRepliesUnreadable({
      unreadable: { inARow: 6, total: 8, cases: ["content_mismatched"], said: "its brackets did not match" },
      judgement: { round: 1, stopped: "unusable_decisions", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 7, done: 2, proven: 2, todo: [], lastIssueCodes: [], judge: { verdict: "unknown", findings: [] } },
      checklist, rounds: 2, decisions: 40, kept: true
    }).message;
    expect(message).toContain("2 of the 2 things you asked have a step that ran, or could run, when the Flow (7 steps) was run from its start, but the Flow was not judged to do what you asked.");
    expect(message.match(/judged/gu)).toHaveLength(1);
  });
});
