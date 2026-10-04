// A build its purse stopped says so in figures, and a call that cost more than
// its purse held it at is counted on the build's accounting (F17 leftovers,
// t194-w23): what the build had spent, what its refused call could have cost,
// against the ceiling -- and the breaches of every round, kept past the loop.
// These builds are given no purse of their own, so each round's loop is given
// what the rounds before left; one purse shared by every round is
// `./shared-purse.test.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmBuildPurseRefusal } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  automationStudioFlowBootstrapBudgetExhausted,
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapBuildPhasesInput,
  type AutomationStudioFlowBootstrapRoundRequest
} from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

function spent(iterations: number, estimatedCostUsd: number, budgetBreaches?: number): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd, ...(budgetBreaches === undefined ? {} : { budgetBreaches }) };
}

function refusal(spentUsd: number, projectedCostUsd: number | undefined, ceilingUsd: number, pendingUsd = 0): Extract<AutomationStudioLlmBuildPurseRefusal, { code: "llm_budget.run_cost_limit" }> {
  return { code: "llm_budget.run_cost_limit", ...(projectedCostUsd === undefined ? {} : { projectedCostUsd }), estimatedInputTokens: 477_506, maxOutputTokens: 8_000, spentUsd, pendingUsd, ceilingUsd };
}

/** A round its cost budget stopped: by the purse's refusal when one is given, by the loop's own arithmetic when not. */
function stoppedByCost(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting, costRefusal?: Extract<AutomationStudioLlmBuildPurseRefusal, { code: "llm_budget.run_cost_limit" }>): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting,
    exhaustion: { bound: "budget", budgetBound: "cost", maxIterations: 64, iterations: accounting.iterations, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [], ...(costRefusal ? { costRefusal } : {}) }
  };
}

function outOfDecisions(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting,
    exhaustion: { bound: "iterations", maxIterations: 64, iterations: 64, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 1, lastIssueCodes: [], outstandingIssueCodes: [] }
  };
}

function finished(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps, accounting };
}

function harness(rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>): { input: AutomationStudioFlowBootstrapBuildPhasesInput; requests: AutomationStudioFlowBootstrapRoundRequest[] } {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  return {
    requests,
    input: {
      round: async (request) => {
        requests.push(request);
        const next = rounds[requests.length - 1];
        if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
        return next(request);
      },
      test: async () => undefined,
      replayable: (steps) => steps.length > 0,
      checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
      budget: { maxCostUsd: 0.25, maxDurationMs: 540_000 },
      maxIterations: 64,
      keep: async () => undefined,
      now: () => 0
    }
  };
}

async function unfinished(input: AutomationStudioFlowBootstrapBuildPhasesInput) {
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);
  if (outcome.kind !== "unfinished") throw new Error(`expected an unfinished build, got ${outcome.kind}`);
  return outcome;
}

describe("the closing message of a build its purse stopped", () => {
  it("states what was spent and what the refused call could have cost, against the ceiling", async () => {
    // Run 9's figures: $0.1539 spent over eight decisions, and a ninth that would have cost up to $0.1458.
    const { input } = harness([() => stoppedByCost([step(1, { acts: ["a1"] })], spent(8, 0.1539), refusal(0.1539, 0.1458, 0.25))]);

    const outcome = await unfinished(input);

    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished: it had spent \$0\.154, and its next call could have cost up to \$0\.146\. 1 of the 3 things you asked has a step in the Flow, not yet shown to work by running it/u);
    expect(outcome.ending.message.length).toBeLessThanOrEqual(1_000);
  });

  it("counts a repair's refusal against the whole build: the rounds before it spent too", async () => {
    // The exploration spent $0.08; the repair's purse was given the $0.17 left, spent $0.05 of it, and refused a call of up to $0.13.
    const partial = [step(1, { acts: ["a1"] })];
    const { input, requests } = harness([
      () => outOfDecisions(partial, spent(64, 0.08)),
      (request) => stoppedByCost(request.repair!.seed, spent(6, 0.05), refusal(0.05, 0.13, request.budget.maxCostUsd!))
    ]);

    const outcome = await unfinished(input);

    expect(requests[1]!.budget.maxCostUsd).toBeCloseTo(0.17, 5);
    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished: it had spent \$0\.130, and its next call could have cost up to \$0\.130\./u);
  });

  it("says nothing was left where the provider does not price, and names money held for calls in flight", () => {
    const told = { bound: "cost" as const, sizes: { maxCostUsd: 0.25 }, judgement: { round: 0, stopped: "budget" as const, tested: "not_tested" as const, testIssueCodes: [], failedSteps: [], stepsInFlow: 0, done: 0, todo: [], lastIssueCodes: [] }, checklist: undefined, rounds: 1, decisions: 9, kept: false };

    expect(automationStudioFlowBootstrapBudgetExhausted({ ...told, spending: { spentUsd: 0.25, pendingUsd: 0 } }).message)
      .toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished: it had spent \$0\.250, which left nothing for its next call\. /u);
    expect(automationStudioFlowBootstrapBudgetExhausted({ ...told, spending: { spentUsd: 0.1, pendingUsd: 0.02, projectedCostUsd: 0.2 } }).message)
      .toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished: it had spent \$0\.100, with \$0\.020 more held for calls still running, and its next call could have cost up to \$0\.200\. /u);
    // Figures belong to a spending limit: another bound says none even if handed some.
    expect(automationStudioFlowBootstrapBudgetExhausted({ ...told, bound: "duration", sizes: { ...told.sizes, maxDurationMs: 540_000 }, spending: { spentUsd: 0.1, pendingUsd: 0 } }).message)
      .toMatch(/^The build stopped at its time limit of 9 minutes before the Flow was finished\. /u);
  });

  it("says what was spent and what was left where the round ended on cost with no call's figures (t194-w47)", async () => {
    // It used to say no figure here: "The build stopped at its spending limit of $0.25 before the Flow was finished. 1 of the 3 ..."
    const { input } = harness([() => stoppedByCost([step(1, { acts: ["a1"] })], spent(40, 0.24))]);

    const outcome = await unfinished(input);

    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished: it had spent \$0\.240, which left \$0\.010, too little for its next call\. 1 of the 3 things you asked has a step in the Flow, not yet shown to work by running it/u);
  });

  it("says the whole build's spend where a repair had nothing left to start with", async () => {
    // The exploration spent the whole ceiling and stopped short; no repair can start, and no call was declined.
    const { input } = harness([() => outOfDecisions([step(1, { acts: ["a1"] })], spent(64, 0.25))]);

    const outcome = await unfinished(input);

    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished: it had spent \$0\.250, which left nothing for its next call\. /u);
  });
});

describe("a build's budget breaches", () => {
  it("are kept past the loop: every round's, on a Flow that was accepted", async () => {
    const partial = [step(1, { acts: ["a1"] })];
    const { input } = harness([
      () => outOfDecisions(partial, spent(64, 0.08, 1)),
      (request) => finished([...request.repair!.seed, step(2, { acts: ["a2"] })], spent(10, 0.03, 2))
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(outcome.accounting.budgetBreaches).toBe(3);
  });

  it("are kept on a build that ended unfinished, in its accounting and its published progress", async () => {
    const { input } = harness([() => stoppedByCost([step(1, { acts: ["a1"] })], spent(8, 0.29, 1), refusal(0.29, 0.1, 0.25))]);

    const outcome = await unfinished(input);

    expect(outcome.accounting.budgetBreaches).toBe(1);
    expect(outcome.progress.accounting.budgetBreaches).toBe(1);
  });

  it("stay absent where no call cost more than it was held at", async () => {
    const { input } = harness([() => finished([step(1, { acts: ["a1"] })], spent(10, 0.03))]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.accounting.budgetBreaches).toBeUndefined();
  });
});
