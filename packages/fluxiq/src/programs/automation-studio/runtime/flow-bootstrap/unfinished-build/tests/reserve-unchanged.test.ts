// A round the judging reserve stopped on the very Flow a judge of this build
// last said no to is not tested or judged again (t254 stage 3, `../phases.ts`):
// the build ends at cost with that judge's findings, saying the reserve was not
// spent because the Flow was unchanged. A changed Flow is tested and judged with
// the reserve as in stage 2 (`../reserve-judging.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse, type AutomationStudioLlmBuildPurseRefusal } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapTestVerdict } from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";
const SPENT = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.004 };

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}
const draft = () => [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })];
const accounting = (iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting => ({ iterations, toolCalls: iterations, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd });

/** Round 0's judge: no, still achievable, with what to change. */
const ROUND_0_NO: Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "no" }> = { verdict: "no", expected: "two packs in the cart", observed: "one pack was added", advice: "set the quantity to 2 before adding", findings: ["result.required_values_missing"], stillAchievable: "yes", spent: SPENT };

/** The purse's refusal of the repair's decision, which would have eaten into the $0.008 kept back for judging. */
const refusal: Extract<AutomationStudioLlmBuildPurseRefusal, { code: "llm_budget.run_cost_limit" }> = {
  code: "llm_budget.run_cost_limit", projectedCostUsd: 0.01, estimatedInputTokens: 20_000, maxOutputTokens: 750, spentUsd: 0.084, pendingUsd: 0, ceilingUsd: 0.1, carriedUsd: 0.07, keptBackUsd: 0.008
};

/**
 * Round 0 finishes and is judged with `round0`; the repair round is refused by
 * the reserve holding the Flow `repaired` makes of its seed. The repair's judge
 * says yes about whatever it is shown.
 */
async function build(options: {
  round0: (signature: string) => AutomationStudioFlowBootstrapTestVerdict;
  repaired: (seed: AutomationStudioFlowDraftStep[]) => AutomationStudioFlowDraftStep[];
  /** What round 0 finishes with, made of the usual draft. */
  round0Steps?: (steps: AutomationStudioFlowDraftStep[]) => AutomationStudioFlowDraftStep[];
}) {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.07 });
  const judged: Array<{ round: number; steps: string[] }> = [];
  const tests: Array<{ steps: number; judged: boolean }> = [];
  const announced: string[] = [];
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
    round: async (request): Promise<AutomationStudioLlmEvidenceLoopResult> => {
      if (request.round === 0) {
        const charged = purse.hold({ projectedCostUsd: 0.01, estimatedInputTokens: 1, maxOutputTokens: 1 });
        if (charged.ok) charged.hold.settle({ estimatedCostUsd: 0.01 });
        return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps: (options.round0Steps ?? ((steps) => steps))(draft()), accounting: accounting(1, 0.01) };
      }
      const steps = options.repaired(request.repair!.seed);
      return {
        ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting: accounting(0, 0),
        exhaustion: { bound: "budget", budgetBound: "cost", costRefusal: { ...refusal }, maxIterations: 64, iterations: 0, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [] }
      };
    },
    judge: async ({ round, loop }) => {
      judged.push({ round, steps: loop.steps.map((each) => each.id ?? "") });
      const held = purse.hold({ projectedCostUsd: 0.004, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
      if (held.ok) held.hold.settle({ estimatedCostUsd: 0.004 });
      const signature = automationStudioFlowDraftFlowSignature(loop.steps);
      return round === 0 ? options.round0(signature) : { verdict: "yes", spent: SPENT, flowSignature: signature };
    },
    test: async (steps, testOptions) => {
      tests.push({ steps: steps.length, judged: testOptions?.judged === true });
      return undefined;
    },
    announce: ({ text }) => announced.push(text),
    replayable: (steps) => steps.length > 0,
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.1, maxDurationMs: 540_000 },
    purse,
    maxIterations: 64,
    keep: async (...args) => ({ revision: 1, steps: (args[2] as unknown[]).length }),
    now: () => 0
  });
  return { outcome, purse, judged, tests, announced };
}

const unchanged = (seed: AutomationStudioFlowDraftStep[]) => seed;
/** The kettle saved from its product page: a different Flow from round 0's. */
const changed = (seed: AutomationStudioFlowDraftStep[]) => [...seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle" } })];

describe("a round the judging reserve stopped on the Flow a judge last said no to (t254 stage 3)", () => {
  it.each([
    ["the verdict's own flowSignature", (signature: string): AutomationStudioFlowBootstrapTestVerdict => ({ ...ROUND_0_NO, flowSignature: signature })],
    ["no flowSignature on the verdict (a no is about the round's own Flow)", (): AutomationStudioFlowBootstrapTestVerdict => ({ ...ROUND_0_NO })]
  ])("spends nothing on it -- no test, no judge -- and ends at cost with that judge's findings, with %s", async (_, round0) => {
    const { outcome, purse, judged, tests, announced } = await build({ round0, repaired: unchanged });

    expect(judged.map((each) => each.round)).toEqual([0]);
    expect(tests).toEqual([]);
    expect(announced).toContain("The build reached its spending limit before the Flow was finished. The Flow is unchanged since the judge said it does not do what was asked, so what was kept back for judging is not spent judging it again.");
    expect(outcome).toMatchObject({ kind: "unfinished", rounds: 2, ending: { kind: "budget_exhausted", bound: "cost" } });
    const message = outcome.kind === "unfinished" ? outcome.ending.message : "";
    expect(message).toContain("its next call could have cost up to $0.010, more than was left beside the $0.008 kept back for judging the Flow, and that was not spent, because the Flow was unchanged since the judge said it does not do what was asked, and it had spent $0.084 ($0.070 of it by earlier builds of this Flow) in all.");
    expect(message).toContain("The Flow (3 steps) ran from its start, but what it did was judged not to be what you asked.");
    expect(message).toContain('The judge found: one pack was added. What the judge says is left to change: "set the quantity to 2 before adding".');
    expect(message).toContain("The steps I found so far were kept as a draft");
    expect(message).not.toContain("went on testing and judging");
    // Round 0's decision and judging only; the reserve was left.
    expect(outcome.kind === "unfinished" && outcome.accounting.estimatedCostUsd).toBeCloseTo(0.014, 9);
    expect(purse.spentUsd()).toBeCloseTo(0.084, 9);
  });

  it("never ends not doable from there, even when that judge said what was asked can no longer be had", async () => {
    // Round 0's Flow holds a step carried from an earlier Flow and never run in this build, so its judged no -- "no longer achievable" -- measured
    // nothing and a repair follows (t194-w70). The repair is stopped by the reserve on that same Flow: money stopped it, not a judged dead end.
    const carried = (seed: AutomationStudioFlowDraftStep[]) => seed.map((each) => (each.position === 1 ? (({ ranWith: _ranWith, ...rest }) => ({ ...rest, id: "f1" }))(each) : each));
    const { outcome, judged, tests } = await build({ round0: (signature) => ({ ...ROUND_0_NO, stillAchievable: "no", flowSignature: signature }), repaired: unchanged, round0Steps: carried });

    expect(judged.map((each) => each.round)).toEqual([0]);
    expect(tests).toEqual([]);
    expect(outcome).toMatchObject({ kind: "unfinished", rounds: 2, ending: { kind: "budget_exhausted", bound: "cost" } });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("The judge found: one pack was added.");
  });

  it("tests and judges a changed Flow with the reserve, as in stage 2: judged yes about it, the build finishes", async () => {
    const { outcome, judged, tests } = await build({ round0: (signature) => ({ ...ROUND_0_NO, flowSignature: signature }), repaired: changed });

    expect(tests).toEqual([{ steps: 3, judged: true }]);
    expect(judged).toEqual([{ round: 0, steps: ["d1", "d2", "d3"] }, { round: 1, steps: ["d1", "d2", "d9"] }]);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2, judged: { verdict: "yes" } });
  });

  it("tests and judges the Flow when the no was about a test of another version of it: unchanged means the Flow that judge judged", async () => {
    const { outcome, judged, tests } = await build({ round0: () => ({ ...ROUND_0_NO, flowSignature: "another Flow" }), repaired: unchanged });

    expect(tests).toEqual([{ steps: 3, judged: true }]);
    expect(judged.map((each) => each.round)).toEqual([0, 1]);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
  });

  it("tests and judges the Flow when the earlier judge was unsure rather than saying no", async () => {
    const { outcome, judged, tests } = await build({ round0: (signature) => ({ verdict: "unknown", why: "the two checks disagreed", spent: SPENT, flowSignature: signature }), repaired: unchanged });

    expect(tests).toEqual([{ steps: 3, judged: true }]);
    expect(judged.map((each) => each.round)).toEqual([0, 1]);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
  });
});
