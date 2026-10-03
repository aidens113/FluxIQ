// One purse per Flow creation, the only cost authority (t234): every round of
// a build, its test and its judge draw from it, no round is given a fresh share
// of it, and a cost ending's figures are the purse's -- what earlier builds of
// the Flow spent, named, and what of the Flow's ceiling building again has left.
// Rounds are scripted: each charges the purse it is handed as its calls would.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse, type AutomationStudioLlmBuildPurseRefusal } from "../../../llm/build-purse/index.ts";
import {
  AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD,
  type AutomationStudioLlmEvidenceLoopAccounting,
  type AutomationStudioLlmEvidenceLoopBudget,
  type AutomationStudioLlmEvidenceLoopResult
} from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapBuildPhasesInput,
  type AutomationStudioFlowBootstrapRoundRequest
} from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";
/** A Flow creation's ceiling, as configured (FLUXIQ_LLM_RUN_COST_CEILING_USD): every figure below is a share of it. */
const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
const usd = (amount: number) => `$${amount.toFixed(3)}`;
/** That `message` opens with `prefix`, shown as a diff when it does not. */
const opens = (message: string, prefix: string) => expect(message.slice(0, prefix.length)).toBe(prefix);

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

function spent(iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd };
}

/** One call made under the purse: held at its worst case, then charged what it reported. */
function charge(purse: AutomationStudioLlmBuildPurse | undefined, costUsd: number): void {
  if (!purse) throw new Error("the round was handed no purse");
  const held = purse.hold({ projectedCostUsd: costUsd, estimatedInputTokens: 10_000, maxOutputTokens: 8_000 });
  if (!held.ok) throw new Error("the purse refused a call the test expected it to pay for");
  held.hold.settle({ estimatedCostUsd: costUsd });
}

/** A call the purse refuses: its refusal, as the loop's exhaustion carries it. */
function refused(purse: AutomationStudioLlmBuildPurse | undefined, projectedCostUsd: number): AutomationStudioLlmBuildPurseRefusal {
  if (!purse) throw new Error("the round was handed no purse");
  const held = purse.hold({ projectedCostUsd, estimatedInputTokens: 72_677, maxOutputTokens: 8_000 });
  if (held.ok) throw new Error("the purse paid for a call the test expected it to refuse");
  return held.refusal;
}

function outOfDecisions(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting,
    exhaustion: { bound: "iterations", maxIterations: 64, iterations: 64, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 1, lastIssueCodes: [], outstandingIssueCodes: [] }
  };
}

/** A round the purse stopped: the loop ends on cost only with the purse's refusal (t234). */
function stoppedByPurse(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting, costRefusal: AutomationStudioLlmBuildPurseRefusal): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting,
    exhaustion: { bound: "budget", budgetBound: "cost", maxIterations: 64, iterations: accounting.iterations, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [], costRefusal }
  };
}

function finished(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps, accounting };
}

function harness(purse: AutomationStudioLlmBuildPurse, rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>, overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => {
      requests.push(request);
      const next = rounds[requests.length - 1];
      if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
      return next(request);
    },
    test: async () => undefined,
    replayable: (steps) => steps.length > 0,
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: CEILING, maxDurationMs: 540_000 },
    purse,
    maxIterations: 64,
    keep: async (...args) => ({ revision: 1, steps: (args[2] as unknown[]).length }),
    now: () => 0,
    ...overrides
  };
  return { input, requests };
}

async function unfinished(input: AutomationStudioFlowBootstrapBuildPhasesInput) {
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);
  if (outcome.kind !== "unfinished") throw new Error(`expected an unfinished build, got ${outcome.kind}`);
  return outcome;
}

describe("a build's rounds draw from one purse", () => {
  it("hands every round the same purse: the repair sees what the exploration spent, and its budget is never refilled", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING });
    const leftAtStart: number[] = [];
    const { input, requests } = harness(purse, [
      (request) => { leftAtStart.push(request.purse!.leftUsd()); charge(request.purse, 0.3 * CEILING); return outOfDecisions([step(1, { acts: ["a1"] })], spent(64, 0.3 * CEILING)); },
      (request) => { leftAtStart.push(request.purse!.leftUsd()); charge(request.purse, 0.2 * CEILING); return finished([...request.repair!.seed, step(2, { acts: ["a1.quantity"] }), step(3, { acts: ["a2"] })], spent(10, 0.2 * CEILING)); }
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(requests).toHaveLength(2);
    expect(requests[0]!.purse).toBe(purse);
    expect(requests[1]!.purse).toBe(purse);
    // The repair's decisions are held against what the exploration left, not a fresh share.
    expect(leftAtStart[0]).toBeCloseTo(CEILING, 9);
    expect(leftAtStart[1]).toBeCloseTo(0.7 * CEILING, 9);
    // Its budget keeps the whole ceiling, for the model to be told: the purse holds what is left of it.
    expect(requests[1]!.budget.maxCostUsd).toBe(CEILING);
    expect(purse.spentUsd()).toBeCloseTo(0.5 * CEILING, 9);
  });

  it("starts no repair once the purse is spent, though the rounds' own accounting says money is left", async () => {
    // An earlier build of this Flow spent 90% of the ceiling; this build's exploration spent the rest.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING, carriedUsd: 0.9 * CEILING });
    const { input, requests } = harness(purse, [
      (request) => { charge(request.purse, 0.1 * CEILING); return outOfDecisions([step(1, { acts: ["a1"] })], spent(64, 0.1 * CEILING)); }
    ]);

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(1);
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    // No call was refused: the figures are what the purse has spent, earlier builds' part named.
    opens(outcome.ending.message, `The build stopped at its spending limit of $${CEILING.toFixed(2)} before the Flow was finished: it had spent ${usd(CEILING)} (${usd(0.9 * CEILING)} of it by earlier builds of this Flow), which left nothing for its next call. `);
    expect(outcome.ending.message).toContain(`The Flow so far was kept, and building again carries on from it, with nothing left of this Flow's $${CEILING.toFixed(2)}.`);
  });

  it("asks the judge within what the purse has left, not what the rounds' accounting left", async () => {
    // Earlier builds spent half the ceiling; the exploration spends a fifth, and a call of a tenth is still in flight.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING, carriedUsd: 0.5 * CEILING });
    const budgets: AutomationStudioLlmEvidenceLoopBudget[] = [];
    const { input } = harness(purse, [
      (request) => {
        charge(request.purse, 0.2 * CEILING);
        const inFlight = request.purse!.hold({ projectedCostUsd: 0.1 * CEILING, estimatedInputTokens: 1, maxOutputTokens: 1 });
        if (!inFlight.ok) throw new Error("the purse refused the call in flight");
        return finished([step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"] }), step(3, { acts: ["a2"] })], spent(10, 0.2 * CEILING));
      }
    ], {
      judge: async ({ budget, loop }) => { budgets.push(budget); return { verdict: "yes", spent: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) }; }
    });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(budgets).toHaveLength(1);
    // The rounds' own accounting would have left 80%; the purse has 20% left once earlier builds and the call in flight are taken out.
    expect(budgets[0]!.maxCostUsd).toBeCloseTo(purse.leftUsd(), 12);
    expect(budgets[0]!.maxCostUsd).toBeCloseTo(0.2 * CEILING, 9);
  });
});

describe("a cost ending's figures are the purse's", () => {
  it("states what earlier builds of this Flow spent, and what the Flow has left of its ceiling", async () => {
    // An earlier build spent a quarter of the ceiling; this one spends half, then a call of up to 30% is refused.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING, carriedUsd: 0.25 * CEILING });
    const { input } = harness(purse, [
      (request) => { charge(request.purse, 0.5 * CEILING); return stoppedByPurse([step(1, { acts: ["a1"] })], spent(8, 0.5 * CEILING), refused(request.purse, 0.3 * CEILING)); }
    ]);

    const outcome = await unfinished(input);

    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    opens(outcome.ending.message, `The build stopped at its spending limit of $${CEILING.toFixed(2)} before the Flow was finished: it had spent ${usd(0.75 * CEILING)} (${usd(0.25 * CEILING)} of it by earlier builds of this Flow), and its next call could have cost up to ${usd(0.3 * CEILING)}. `);
    expect(outcome.ending.message).toContain(`The Flow so far was kept, and building again carries on from it, with ${usd(0.25 * CEILING)} left of this Flow's $${CEILING.toFixed(2)}.`);
  });

  it("says a repair's refusal as it stands: the purse already counts what the rounds before it spent", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING });
    const { input, requests } = harness(purse, [
      (request) => { charge(request.purse, 0.4 * CEILING); return outOfDecisions([step(1, { acts: ["a1"] })], spent(64, 0.4 * CEILING)); },
      (request) => { charge(request.purse, 0.3 * CEILING); return stoppedByPurse(request.repair!.seed, spent(6, 0.3 * CEILING), refused(request.purse, 0.5 * CEILING)); }
    ]);

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(2);
    // 70% spent, never the 110% that adding the exploration's spend to the refusal's again would say.
    opens(outcome.ending.message, `The build stopped at its spending limit of $${CEILING.toFixed(2)} before the Flow was finished: it had spent ${usd(0.7 * CEILING)}, and its next call could have cost up to ${usd(0.5 * CEILING)}. `);
    expect(outcome.ending.message).not.toContain("earlier builds");
    expect(outcome.ending.message).toContain(`with ${usd(0.3 * CEILING)} left of this Flow's $${CEILING.toFixed(2)}.`);
  });
});
