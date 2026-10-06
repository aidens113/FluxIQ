// A round the judging reserve stopped spends that reserve judging the Flow as
// it stands (t254 stage 2, decision 4; `../reserve-judging.ts`): judged yes
// about that Flow, the build finishes; anything else ends it at its budget with
// the judge's account and the Flow kept as a draft, never "not doable". A cost
// stop that kept nothing back ends as it always did.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse, type AutomationStudioLlmBuildPurseRefusal } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapBuildPhasesInput, type AutomationStudioFlowBootstrapTestVerdict } from "../index.ts";

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

/** The purse's refusal of a decision that would have eaten into the judging kept back (`keptBackUsd`), or of one that simply did not fit (none kept back). */
const refusal = (keptBackUsd: number | undefined): Extract<AutomationStudioLlmBuildPurseRefusal, { code: "llm_budget.run_cost_limit" }> => ({
  code: "llm_budget.run_cost_limit", projectedCostUsd: 0.006, estimatedInputTokens: 20_000, maxOutputTokens: 750, spentUsd: 0.09, pendingUsd: 0, ceilingUsd: 0.1, carriedUsd: 0.07, ...(keptBackUsd !== undefined ? { keptBackUsd } : {})
});

/** A round the purse stopped on cost, holding `steps`. */
const costStopped = (steps: AutomationStudioFlowDraftStep[], keptBackUsd: number | undefined): AutomationStudioLlmEvidenceLoopResult => ({
  ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting: accounting(4, 0.02),
  exhaustion: { bound: "budget", budgetBound: "cost", costRefusal: refusal(keptBackUsd), maxIterations: 64, iterations: 4, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [] }
});

/** A build whose first round the purse stops on cost; the judge answers `verdict` about whatever it is shown. */
async function build(options: {
  keptBackUsd?: number | undefined;
  steps?: AutomationStudioFlowDraftStep[];
  verdict?: (signature: string) => AutomationStudioFlowBootstrapTestVerdict;
  test?: AutomationStudioFlowBootstrapBuildPhasesInput["test"];
  accept?: boolean;
}) {
  // $0.09 of $0.10 spent: what the refusal says.
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: 0.07 });
  const charged = purse.hold({ projectedCostUsd: 0.02, estimatedInputTokens: 1, maxOutputTokens: 1 });
  if (charged.ok) charged.hold.settle({ estimatedCostUsd: 0.02 });
  const judged: Array<{ round: number; steps: string[] }> = [];
  const tests: Array<{ steps: number; judged: boolean }> = [];
  const accepted: string[][] = [];
  const kept: number[] = [];
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
    round: async (request) => {
      if (request.round > 0) throw new Error("no round after a cost stop");
      return costStopped(options.steps ?? draft(), "keptBackUsd" in options ? options.keptBackUsd : 0.005);
    },
    judge: async ({ round, loop }) => {
      judged.push({ round, steps: loop.steps.map((each) => each.id ?? "") });
      // The judge's calls draw on the reserve.
      const held = purse.hold({ projectedCostUsd: 0.004, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
      if (held.ok) held.hold.settle({ estimatedCostUsd: 0.004 });
      return (options.verdict ?? ((signature) => ({ verdict: "yes", spent: SPENT, flowSignature: signature })))(automationStudioFlowDraftFlowSignature(loop.steps));
    },
    ...(options.accept !== undefined ? { acceptStopped: async (loop) => { accepted.push(loop.steps.map((each) => each.id ?? "")); return options.accept === true; } } : {}),
    test: options.test ?? (async (steps, testOptions) => {
      tests.push({ steps: steps.length, judged: testOptions?.judged === true });
      return undefined;
    }),
    replayable: (steps) => steps.length > 0,
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.1, maxDurationMs: 540_000 },
    purse,
    maxIterations: 64,
    keep: async (...args) => {
      kept.push((args[2] as unknown[]).length);
      return { revision: 1, steps: (args[2] as unknown[]).length };
    },
    now: () => 0
  });
  return { outcome, purse, judged, tests, accepted, kept };
}

describe("a round the judging reserve stopped (t254 stage 2)", () => {
  it("tests the Flow so far from its start for the judge, and finishes the build when it is judged yes about that Flow", async () => {
    const { outcome, judged, tests, accepted, purse } = await build({ accept: true });

    expect(tests).toEqual([{ steps: 3, judged: true }]);
    // The caller is asked first whether it can build that Flow, and makes it its plan.
    expect(accepted).toEqual([["d1", "d2", "d3"]]);
    expect(judged).toEqual([{ round: 0, steps: ["d1", "d2", "d3"] }]);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 1, judged: { verdict: "yes" } });
    expect(outcome.kind === "finished" && outcome.loop).toMatchObject({ ok: true, result: { summary: expect.stringContaining("spending limit") } });
    // The judge's spend is the build's.
    expect(outcome.kind === "finished" && outcome.accounting.estimatedCostUsd).toBeCloseTo(0.024, 9);
    expect(purse.spentUsd()).toBeCloseTo(0.094, 9);
  });

  it("ends at cost with the judge's findings, the Flow kept as a draft, when it is judged no -- never not doable, even when the judge says it can no longer be had", async () => {
    const { outcome, judged, kept } = await build({
      verdict: (signature) => ({ verdict: "no", expected: "two packs in the cart", observed: "one pack was added", advice: "set the quantity to 2 before adding", findings: ["result.required_values_missing"], stillAchievable: "no", spent: SPENT, flowSignature: signature })
    });

    expect(judged).toHaveLength(1);
    expect(kept).toEqual([3]);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    const message = outcome.kind === "unfinished" ? outcome.ending.message : "";
    expect(message).toContain("so that went on testing and judging the Flow as it stood ($0.004), and it had spent $0.094 ($0.070 of it by earlier builds of this Flow) in all.");
    // The test is said once, inside how much was done (t193 round 1003): its step count there, never "judged not" twice.
    expect(message).toContain("when the Flow (3 steps) was run from its start, and 3 more have a step that did not work in that run, but the Flow was judged not to do what you asked.");
    expect(message).not.toContain("what it did was judged not to be what you asked");
    expect(message).toContain('The judge found: one pack was added. What the judge says is left to change: "set the quantity to 2 before adding".');
    expect(message).toContain("The steps I found so far were kept as a draft");
    expect(message).not.toContain("kept back for judging the Flow, and its next call");
  });

  it("ends at cost saying the judge could not confirm it, when the yes was about another version of the Flow", async () => {
    const { outcome } = await build({ verdict: () => ({ verdict: "yes", spent: SPENT, flowSignature: "another Flow" }) });

    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("The judge could not confirm it: the judge's yes was about a test of another version of the Flow");
  });

  it("does not judge a Flow whose test failed, nor one the caller cannot build, nor an empty one: those end at cost as before", async () => {
    const failed = await build({ test: async () => ({ issueCodes: ["replay.target_missing"] }) });
    expect(failed.judged).toEqual([]);
    expect(failed.outcome.kind === "unfinished" && failed.outcome.ending.message).toContain("$0.005 was kept back for judging the Flow, and its next call could have cost up to $0.006.");

    const refused = await build({ accept: false });
    expect(refused.accepted).toHaveLength(1);
    expect(refused.judged).toEqual([]);
    expect(refused.outcome.kind === "unfinished" && refused.outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });

    const empty = await build({ steps: [] });
    expect(empty.tests).toEqual([]);
    expect(empty.judged).toEqual([]);
    expect(empty.outcome.kind === "unfinished" && empty.outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
  });

  it("leaves a cost stop that kept nothing back as it was: no test, no judge, the ending at cost", async () => {
    const { outcome, judged, tests } = await build({ keptBackUsd: undefined });

    expect(tests).toEqual([]);
    expect(judged).toEqual([]);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("it had spent $0.090 ($0.070 of it by earlier builds of this Flow), and its next call could have cost up to $0.006.");
  });
});


it("uses actual reserved call slots to judge a full test after call admission stops exploration", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 3 });
  const sent = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1 });
  if (sent.ok) sent.hold.settle();
  let tests = 0;
  let judges = 0;
  const steps = draft();
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
    purse, maxIterations: 64, budget: { maxCostUsd: 1 },
    round: async () => {
      const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1 });
      expect(held.ok).toBe(false);
      if (held.ok || held.refusal.code !== "llm_budget.run_call_limit") throw new Error("Expected reserved call refusal");
      return { ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting: accounting(1, 0.001),
        exhaustion: { bound: "budget", budgetBound: "calls", callRefusal: held.refusal, maxIterations: 64, iterations: 1, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [] } };
    },
    test: async () => { tests += 1; return undefined; }, replayable: () => true,
    checklist: (current) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: current }),
    judge: async ({ loop }) => {
      for (let index = 0; index < 2; index += 1) {
        const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
        expect(held.ok).toBe(true); if (held.ok) held.hold.settle(); judges += 1;
      }
      return { verdict: "yes", spent: SPENT, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) };
    },
    acceptStopped: async () => true, keep: async () => undefined
  });
  expect(outcome.kind).toBe("finished");
  expect(tests).toBe(1); expect(judges).toBe(2); expect(purse.spentCalls()).toBe(3);
  expect(outcome.kind === "finished" && outcome.loop.result.summary).toContain("model call allowance");
});
