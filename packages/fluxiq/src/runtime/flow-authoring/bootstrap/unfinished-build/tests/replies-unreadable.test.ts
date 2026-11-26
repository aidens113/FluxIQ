// A build whose model replies kept arriving unreadable is never "not doable" and never a bare code (t211). No count of
// them ends a build any more (t1056): its budget does, and the budget's ending says what the money last went on --
// those unreadable replies, how many in a row, how many in all -- as a detail, not as an ending of its own.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResult } from "../../../../llm/index.ts";
import { parseAutomationStudioFlowBootstrapBuildEnding } from "../../generation-failure/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapBuildPhasesInput } from "../index.ts";
import { automationStudioFlowBootstrapBudgetExhausted } from "../budget-exhausted.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";

function step(position: number, acts: string[]): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, acts
  };
}

/** A round its token budget ended while its last six replies arrived unreadable. */
function unreadable(steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit",
    exhaustion: { bound: "budget", budgetBound: "tokens", iterations: 14, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: ["llm.provider_malformed_response"], outstandingIssueCodes: [] },
    trace: [{ iteration: 14, decision: "unusable", resultCode: "llm.provider_malformed_response", resultReason: "content_mismatched" }], steps,
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
    budget: { maxCostUsd: 0.25, maxDurationMs: 540_000, maxTotalTokens: 19_000 },
    
    keep: async (...args) => { kept.push(args); return { revision: 1, steps: (args[2] as unknown[]).length }; },
    now: () => 0
  };
  return { input, rounds, tested, kept };
}

describe("a build whose budget ran out while its replies kept arriving unreadable", () => {
  it("ends on its budget, saying the money last went on unreadable replies, how many, what is done and what was kept", async () => {
    const { input, rounds, kept } = phases(() => unreadable([step(1, ["a1"])]));

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(rounds).toEqual([0]);
    expect(kept).toHaveLength(1);
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "tokens" });
    const message = outcome.ending.message;
    expect(message).toMatch(/^The build stopped at its budget of 19000 tokens before the Flow was finished. Its last 6 replies came back unreadable -- most often because its brackets did not match/u);
    expect(message).toContain("and it asked again each time, with a note of what was wrong.");
    expect(message).toContain("In all, 8 of 14 replies could not be read; each was paid for and counted in the build's budget.");
    expect(message).not.toMatch(/model|llm./u);
  });

  it("is published as the budget's ending, and reads back", async () => {
    const { input } = phases(() => unreadable([]));
    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);
    if (outcome.kind !== "unfinished") throw new Error("expected an unfinished build");
    expect(parseAutomationStudioFlowBootstrapBuildEnding(outcome.ending, "flow_bootstrap.evidence_budget_exhausted")).toEqual(outcome.ending);
    expect(outcome.ending.message).toContain("No step I found belonged in the Flow.");
  });
});

// t193 round 1003 (w9): the progress and the last test said once, never "not judged" twice.
describe("a budget ending with unreadable replies after a judged test", () => {
  it("says the Flow was not judged once, with its step count in the progress sentence", () => {
    const checklist = [{ id: "a1", verb: "add", quote: "add two packs", done: 1 }, { id: "a2", verb: "save", quote: "save the kettle", done: 2 }];
    const message = automationStudioFlowBootstrapBudgetExhausted({
      bound: "tokens", sizes: { maxTotalTokens: 19_000 },
      unreadable: { inARow: 6, total: 8, cases: ["content_mismatched"], said: "its brackets did not match" },
      judgement: { round: 1, stopped: "budget", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 7, done: 2, proven: 2, todo: [], lastIssueCodes: [], judge: { verdict: "unknown", findings: [] } },
      checklist, rounds: 2, decisions: 40, kept: true
    }).message;
    expect(message).toContain("2 of the 2 things you asked have a step that ran, or could run, when the Flow (7 steps) was run from its start, but the Flow was not judged to do what you asked.");
    expect(message.match(/judged/gu)).toHaveLength(1);
    expect(message).toContain("Its last 6 replies came back unreadable");
  });
});
