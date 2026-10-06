// A Flow the model says is ready (t195): its test from the start is judged
// against the instruction. The user's rule (2026-10-02): a build finishes only
// on a `yes` about a test of the Flow as it finally stands -- the verdict's
// `flowSignature` is that Flow's. Anything else -- `no`, an unsure verdict, one
// not judged, a `yes` about another version or about no test -- is repaired
// live with the judge's account, under the same funding and progress bounds; a
// repair that gets no further ends it not finished, after one more round where
// the judge named the fix (t195-w37). The judge's spend
// counts against the build's budget. Judges are scripted: no provider.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopBudget, AutomationStudioLlmEvidenceLoopResult, AutomationStudioLlmEvidenceLoopTrace } from "../../../llm/index.ts";
import { automationStudioLlmEvidenceResumeEntry } from "../../../llm/evidence-loop/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapBuildPhasesInput,
  type AutomationStudioFlowBootstrapRoundRequest,
  type AutomationStudioFlowBootstrapTestVerdict
} from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";
const JUDGE_SPEND = { inputTokens: 3_000, outputTokens: 200, totalTokens: 3_200, estimatedCostUsd: 0.004 };

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

function spent(iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd };
}

const TRACE: AutomationStudioLlmEvidenceLoopTrace[] = [{ iteration: 1, decision: "tool_call", toolId: "web.dom.click" }, { iteration: 2, decision: "complete" }];

/** A Flow that does every act and choice by the checklist's reading: towels added, two of them, kettle saved. */
function wholeFlow(): AutomationStudioFlowDraftStep[] {
  return [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })];
}

function finished(steps: AutomationStudioFlowDraftStep[], accounting = spent(2, 0.03)): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Adds and saves." }, trace: TRACE.map((row) => ({ ...row })), steps, accounting };
}

const NO: AutomationStudioFlowBootstrapTestVerdict = {
  verdict: "no", expected: "two packs of Softly Paper Towels in the cart", observed: "the test pressed Add on the Softly napkins", advice: "press Add on the towels' own card", findings: ["step 1 acted on the napkins"], spent: JUDGE_SPEND
};
type JudgeCall = { round: number; steps: number; budget: AutomationStudioLlmEvidenceLoopBudget; signature: string };

/** A yes about the test of the very Flow the round finished with. */
const YES = (call: JudgeCall): AutomationStudioFlowBootstrapTestVerdict => ({ verdict: "yes", spent: JUDGE_SPEND, flowSignature: call.signature });

function harness(
  rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>,
  verdicts: Array<(call: JudgeCall) => AutomationStudioFlowBootstrapTestVerdict>,
  overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}
) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const judged: JudgeCall[] = [];
  const announced: string[] = [];
  const kept: unknown[][] = [];
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => {
      requests.push(request);
      const next = rounds[requests.length - 1];
      if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
      return next(request);
    },
    judge: async ({ round, loop, budget }) => {
      const call = { round, steps: loop.steps.length, budget, signature: automationStudioFlowDraftFlowSignature(loop.steps) };
      judged.push(call);
      const next = verdicts[judged.length - 1];
      if (!next) throw new Error(`no verdict ${judged.length - 1} scripted`);
      return next(call);
    },
    test: async () => undefined,
    replayable: (steps) => steps.length > 0 && steps.every((each) => each.replay !== undefined),
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.25, maxDurationMs: 540_000 },
    maxIterations: 64,
    keep: async (...args) => { kept.push(args); return { revision: 1, steps: (args[2] as unknown[]).length }; },
    announce: ({ phase, label, text }) => { announced.push(`${phase}: ${label}: ${text}`); },
    now: () => 0,
    ...overrides
  };
  return { input, requests, judged, announced, kept };
}

describe("a Flow the model says is ready, judged on what its test did", () => {
  it("is the build's result when judged yes, with the judge's spend in the build's accounting", async () => {
    const { input, judged, requests } = harness([() => finished(wholeFlow())], [YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.judged).toEqual({ verdict: "yes", spent: JUDGE_SPEND, flowSignature: automationStudioFlowDraftFlowSignature(wholeFlow()) });
    // The judge was given what the round left of the build's $0.25.
    expect(judged).toHaveLength(1);
    expect(judged[0]!.budget.maxCostUsd).toBeCloseTo(0.22, 5);
    // The round's two decisions and its tokens, plus the judge's tokens and cost, and no decision for the judge.
    expect(outcome.accounting).toMatchObject({ iterations: 2, toolCalls: 2, inputTokens: 5_000, outputTokens: 400, totalTokens: 5_400 });
    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(0.034, 6);
  });

  it("repairs a Flow judged no live, from that Flow and the judge's reasons, and finishes when the repair is judged yes", async () => {
    const { input, requests, judged, announced } = harness([
      () => finished(wholeFlow()),
      (request) => finished([...request.repair!.seed.slice(0, 2).map((each) => ({ ...each })), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle-save" } })])
    ], [() => NO, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.rounds).toBe(2);
    expect(outcome.judged?.verdict).toBe("yes");
    expect(judged.map((call) => call.round)).toEqual([0, 1]);
    // Phase 3: seeded with the Flow the round finished with, renumbered, nothing of its calls.
    const repair = requests[1]!.repair!;
    expect(repair.seed.map((each) => [each.id, each.position, each.callId])).toEqual([["d1", 1, undefined], ["d2", 2, undefined], ["d3", 3, undefined]]);
    expect(repair.resume).toMatchObject({
      stopped: "judged_wrong",
      judgement: {
        stopped: "judged_wrong", test: "replayed_clean", stepsInFlow: 3,
        judge: { verdict: "no", observed: "the test pressed Add on the Softly napkins", expected: "two packs of Softly Paper Towels in the cart", advice: "press Add on the towels' own card", findings: ["step 1 acted on the napkins"] }
      }
    });
    // The repair's first decision reads the judged instruction.
    expect(automationStudioLlmEvidenceResumeEntry(repair.resume, repair.seed).value.instruction).toMatch(/^The Flow you said was ready was tested from its start and judged/u);
    expect(announced).toEqual([
      "verifying: Judging the Flow: The Flow was tested from its start. Judging what the test did against what you asked.",
      "repairing: Repairing the Flow: The Flow was tested from its start and judged not to do what you asked: the test pressed Add on the Softly napkins. Repairing it live.",
      "verifying: Judging the Flow: The Flow was tested from its start. Judging what the test did against what you asked."
    ]);
    // Every round's rows, numbered across the build; both judges' spend counted.
    expect(outcome.trace.map((row) => row.iteration)).toEqual([1, 2, 3, 4]);
    expect(outcome.accounting).toMatchObject({ iterations: 4, totalTokens: 2 * 2_200 + 2 * 3_200 });
    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(0.068, 6);
    // The repair was given only what the exploration and the first judge left.
    expect(requests[1]!.budget.maxCostUsd).toBeCloseTo(0.216, 6);
  });

  it("repairs once more after a judge who named the fix, then ends not finished, saying what the judge left to change, when repairs hand back the same Flow judged no again", async () => {
    const same = (request: AutomationStudioFlowBootstrapRoundRequest) => finished(request.repair!.seed.map((each) => ({ ...each })));
    const { input, requests, kept } = harness([() => finished(wholeFlow()), same, same], [() => NO, () => NO, () => NO]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(3);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "not_finished", notDone: [], tried: { rounds: 3, decisions: 6, stepsInFlow: 3, tested: "replayed_clean" } });
    expect(outcome.ending.message).toMatch(/^I have not finished this Flow yet\. My last 2 attempts to fix it each got no further than the one before: the Flow came out exactly the same, 3 of the 3 things you asked have a step, no more than before, and the judge found the same as before\./u);
    expect(outcome.ending.message).toContain("What the judge says is left to change: \"press Add on the towels' own card\".");
    // Said once, with the step count (t193 round 1003, `run-musp4h2f-72e8ed99`).
    expect(outcome.ending.message).toContain("when the Flow (3 steps) was run from its start");
    expect(outcome.ending.message.match(/judged not to (?:do|be) what you asked/gu)).toHaveLength(1);
    expect(outcome.ending.message).not.toContain("without failing");
    expect(outcome.ending.message).not.toContain("found no way");
    expect(kept[0]![0]).toBe("judged_wrong");
  });

  it("is not the build's result when the judge cannot settle it: the Flow is repaired, told the judge's account", async () => {
    const unknown: AutomationStudioFlowBootstrapTestVerdict = { verdict: "unknown", why: "the test read no cart", spent: JUDGE_SPEND, flowSignature: automationStudioFlowDraftFlowSignature(wholeFlow()) };
    const { input, requests, announced } = harness([
      () => finished(wholeFlow()),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle-save" } })])
    ], [() => unknown, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2, judged: { verdict: "yes" } });
    expect(requests[1]!.repair!.resume).toMatchObject({ stopped: "judged_wrong", judgement: { stopped: "judged_wrong", test: "replayed_clean", judge: { verdict: "unknown", findings: ["the test read no cart"] } } });
    expect(announced[1]).toBe("repairing: Repairing the Flow: The Flow is not yet confirmed to do what you asked: the test read no cart. Repairing it live, to test it from its start and check it again.");
  });

  it("is not the build's result when its Flow was not judged, and repairs it", async () => {
    const notJudged: AutomationStudioFlowBootstrapTestVerdict = { verdict: "not_judged", why: "the judge was stopped", spent: JUDGE_SPEND, flowSignature: automationStudioFlowDraftFlowSignature(wholeFlow()) };
    const { input, requests } = harness([
      () => finished(wholeFlow()),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle-save" } })])
    ], [() => notJudged, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ judge: { verdict: "not_judged", findings: ["the judge was stopped"] } });
  });

  it("is not the build's result on a yes about another version of the Flow: that Flow was not judged", async () => {
    const earlier = [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } })];
    const aboutEarlier: AutomationStudioFlowBootstrapTestVerdict = { verdict: "yes", spent: JUDGE_SPEND, flowSignature: automationStudioFlowDraftFlowSignature(earlier) };
    const { input, requests, announced } = harness([
      () => finished(wholeFlow()),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle-save" } })])
    ], [() => aboutEarlier, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
    // Its test was of another Flow: this one is said untested, never tested clean.
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ stopped: "judged_wrong", test: "not_tested", judge: { verdict: "not_judged" } });
    const judge = requests[1]!.repair!.resume.judgement!.judge as { findings: string[] };
    expect(judge.findings[0]).toMatch(/^the judge's yes was about a test of another version of the Flow, not of the Flow as it now stands, so the Flow as it stands was not judged/u);
    expect(announced[1]).toMatch(/^repairing: Repairing the Flow: The Flow is not yet confirmed to do what you asked: the judge's yes was about a test of another version/u);
  });

  it("is not the build's result on a yes about no test at all", async () => {
    const aboutNothing: AutomationStudioFlowBootstrapTestVerdict = { verdict: "yes", spent: JUDGE_SPEND };
    const { input, requests } = harness([
      () => finished(wholeFlow()),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle-save" } })])
    ], [() => aboutNothing, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
    const judge = requests[1]!.repair!.resume.judgement!.judge as { verdict: string; findings: string[] };
    expect(judge.verdict).toBe("not_judged");
    expect(judge.findings[0]).toMatch(/^the judge's yes was about no test of the Flow, so the Flow as it now stands was not judged/u);
  });

  it("counts a Flow judged after one that could not be as progress, and repairs on", async () => {
    const unknown: AutomationStudioFlowBootstrapTestVerdict = { verdict: "unknown", why: "the test read no cart", spent: JUDGE_SPEND, flowSignature: automationStudioFlowDraftFlowSignature(wholeFlow()) };
    const { input, requests } = harness([
      () => finished(wholeFlow()),
      // The same Flow handed back, now judged no: judged where it was not, which is progress.
      (request) => finished(request.repair!.seed.map((each) => ({ ...each }))),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle-save" } })])
    ], [() => unknown, () => NO, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(3);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 3 });
  });

  it("ends not finished when a repair hands back the same Flow, still not judged", async () => {
    const unknown = (call: JudgeCall): AutomationStudioFlowBootstrapTestVerdict => ({ verdict: "unknown", why: "the test read no cart", spent: JUDGE_SPEND, flowSignature: call.signature });
    const { input, requests } = harness([
      () => finished(wholeFlow()),
      (request) => finished(request.repair!.seed.map((each) => ({ ...each })))
    ], [unknown, unknown]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome.kind === "unfinished" && outcome.ending.kind).toBe("not_finished");
  });

  // An extended draft's carried steps have no replay (`llm/node-tools/draft-from-flow.ts`):
  // the judge cannot see what they do, so the Flow is not judged to do what was
  // asked (run 41) and is repaired, its carried steps run again live, until a
  // test of the whole Flow as it stands is judged yes (user, 2026-10-02).
  it("repairs a re-authored Flow whose carried steps were never run in its test, naming them (run 41)", async () => {
    const carried = Array.from({ length: 9 }, (_, index) => step(index + 1, { id: index < 4 ? `d${index + 1}` : `f${index + 1}`, acts: index === 0 ? ["a1"] : index === 1 ? ["a1.quantity"] : index === 4 ? ["a2"] : [] }));
    const unsure: AutomationStudioFlowBootstrapTestVerdict = { verdict: "unknown", why: "steps 5 to 9 were carried from the earlier Flow and not run", untestedCarried: [5, 6, 7, 8, 9], spent: JUDGE_SPEND };
    const { input, requests, announced } = harness([
      () => finished(carried),
      (request) => finished(request.repair!.seed.map((each) => ({ ...each, ranWith: { target: `rerun-${each.position}` } })))
    ], [() => unsure, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2, judged: { verdict: "yes" } });
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ test: "not_tested", judge: { verdict: "unknown", untestedCarried: [5, 6, 7, 8, 9] } });
    expect(announced[1]).toBe("repairing: Repairing the Flow: The Flow was not judged to do what you asked: steps 5, 6, 7, 8, 9 came from the earlier Flow and were not run when it was tested. Repairing it live, running them again.");
  });

  it("still repairs a re-authored Flow the judge found wrong, carried steps or not", async () => {
    const carried = Array.from({ length: 6 }, (_, index) => step(index + 1, { id: index < 3 ? `d${index + 1}` : `f${index + 1}` }));
    const wrong: AutomationStudioFlowBootstrapTestVerdict = { verdict: "no", observed: "the test read no cart", findings: [], spent: JUDGE_SPEND };
    const { input, requests } = harness([
      () => finished(carried),
      (request) => finished(request.repair!.seed.map((each) => ({ ...each, ranWith: { target: `rerun-${each.position}` } })))
    ], [() => wrong, YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ judge: { verdict: "no", observed: "the test read no cart" } });
  });

  it("ends at its budget, the Flow kept, when the judge had no cost left to judge with", async () => {
    const { input, judged, kept } = harness(
      [() => finished(wholeFlow(), spent(40, 0.25))],
      [(call) => (call.budget.maxCostUsd !== undefined && call.budget.maxCostUsd <= 0 ? { verdict: "not_judged", why: "no cost left", spent: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } } : YES(call))]
    );

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(judged[0]!.budget.maxCostUsd).toBe(0);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.kind === "unfinished" && outcome.kept).toBeDefined();
    // The Flow it finished with is kept whole, for building again to carry on from.
    expect(kept).toHaveLength(1);
    expect((kept[0]![2] as unknown[]).length).toBe(3);
  });

  it("ends at its purse, the Flow kept, when its Flow was not judged and the purse cannot fund another round", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    // Four decisions held and charged $0.023 each, the last fitting beside the judging pair kept back (2 x $0.0039,
    // priced at DeepSeek flash's peak rates for a judge's standing allowance): $0.008 is left, under that pair and
    // the least a first decision can be held at ($0.0009).
    const flash = (inputTokens: number, outputTokens: number) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
    const { input, requests, kept } = harness([
      (request) => {
        for (let index = 0; index < 4; index += 1) {
          const held = request.purse!.hold({ projectedCostUsd: 0.023, estimatedInputTokens: 10_000, maxOutputTokens: 750, price: flash });
          if (!held.ok) throw new Error("the purse refused a call the test expected it to pay for");
          held.hold.settle({ estimatedCostUsd: 0.023 });
        }
        return finished(wholeFlow(), spent(4, 0.092));
      }
    ], [(call) => ({ verdict: "not_judged", why: "the judge was stopped", spent: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }, flowSignature: call.signature })], { purse });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("which left $0.008, too little for another round: judging its Flow takes two judge calls held at up to $0.008, and its first decision at least $0.001 more.");
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("The steps I found so far were kept as a draft");
    // The Flow it finished with is kept whole, for building again to carry on from.
    expect(kept).toHaveLength(1);
    expect((kept[0]![2] as unknown[]).length).toBe(3);
  });

  it("finishes unjudged when the build has no judge", async () => {
    const { input, requests } = harness([() => finished(wholeFlow())], []);
    delete input.judge;

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("finished");
    expect(outcome.kind === "finished" && outcome.judged).toBeUndefined();
  });

  it("ends cancelled when the build is cancelled while the judge runs", async () => {
    const { input, requests } = harness([() => finished(wholeFlow())], [() => { throw new DOMException("Aborted", "AbortError"); }]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome).toMatchObject({ kind: "ended", loop: { ok: false, code: "llm_evidence_loop.cancelled" }, rounds: 1 });
    expect(outcome.kind === "ended" && outcome.trace.map((row) => row.iteration)).toEqual([1, 2]);
  });

  it("lets any other failure of the judge through untouched", async () => {
    const broken = new Error("judge broke");
    const { input } = harness([() => finished(wholeFlow())], [() => { throw broken; }]);
    await expect(runAutomationStudioFlowBootstrapBuildPhases(input)).rejects.toBe(broken);
  });
});
