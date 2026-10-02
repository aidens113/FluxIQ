// A Flow the model says is ready (t195): its test from the start is judged
// against the instruction. `yes` is the build's result; `no` is repaired live
// with the judge's reasons, and "not doable" only when a repair hands back the
// same Flow; an unsure verdict is the result, unverified, except where steps
// carried from an earlier Flow were not run in the test. The judge's spend
// counts against the build's budget. Judges are scripted: no provider.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
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
const YES: AutomationStudioFlowBootstrapTestVerdict = { verdict: "yes", spent: JUDGE_SPEND };

type JudgeCall = { round: number; steps: number; budget: AutomationStudioLlmEvidenceLoopBudget };

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
      const call = { round, steps: loop.steps.length, budget };
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
    const { input, judged, requests } = harness([() => finished(wholeFlow())], [() => YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.judged).toEqual(YES);
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
    ], [() => NO, () => YES]);

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

  it("ends not doable, saying what the judge found, when a repair hands back the same Flow judged no again", async () => {
    const { input, requests, kept } = harness([
      () => finished(wholeFlow()),
      (request) => finished(request.repair!.seed.map((each) => ({ ...each })))
    ], [() => NO, () => NO]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "not_doable", notDone: [], tried: { rounds: 2, decisions: 4, stepsInFlow: 3, tested: "replayed_clean" } });
    expect(outcome.ending.message).toMatch(/^I could not build this Flow, and I found no way to: it was tested from its start and judged not to do what you asked/u);
    expect(outcome.ending.message).toContain("what you asked: \"two packs of Softly Paper Towels in the cart\"; what its test did: \"the test pressed Add on the Softly napkins\"");
    expect(outcome.ending.message).toContain("ran from its start, but what it did was judged not to be what you asked");
    expect(outcome.ending.message).not.toContain("without failing");
    expect(outcome.ending.message).toContain("and the last repair made no measurable progress on the round before it: it handed back the same Flow; no more of the 3 things you asked had a step (3, as before); the judge found the same as before.");
    expect(kept[0]![0]).toBe("judged_wrong");
  });

  it("is the build's result, unverified, when the judge cannot settle it", async () => {
    const unknown: AutomationStudioFlowBootstrapTestVerdict = { verdict: "unknown", why: "the test read no cart", spent: JUDGE_SPEND };
    const { input, requests } = harness([() => finished(wholeFlow())], [() => unknown]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("finished");
    expect(outcome.kind === "finished" && outcome.judged).toMatchObject({ verdict: "unknown", why: "the test read no cart" });
  });

  // An extended draft's carried steps have no replay (`llm/node-tools/draft-from-flow.ts`),
  // so no build's test can run them. Repairing for them ended every improvement
  // the judge could not see whole as "not doable" (the extension chat's "improve
  // an automation"). The claims still never decide (run 41): the judge is told
  // those steps did not run, the outcome names them, and the first real run is judged.
  it("is the result, unverified and naming them, when a re-authored Flow's carried steps were never run in its test (run 41)", async () => {
    const carried = Array.from({ length: 9 }, (_, index) => step(index + 1, { id: index < 4 ? `d${index + 1}` : `f${index + 1}`, acts: index === 0 ? ["a1"] : index === 1 ? ["a1.quantity"] : index === 4 ? ["a2"] : [] }));
    const unsure: AutomationStudioFlowBootstrapTestVerdict = { verdict: "unknown", why: "steps 5 to 9 were carried from the earlier Flow and not run", untestedCarried: [5, 6, 7, 8, 9], spent: JUDGE_SPEND };
    const { input, requests } = harness([() => finished(carried)], [() => unsure]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(requests).toHaveLength(1);
    expect(outcome.kind === "finished" && outcome.judged).toMatchObject({ verdict: "unknown", untestedCarried: [5, 6, 7, 8, 9] });
  });

  it("still repairs a re-authored Flow the judge found wrong, carried steps or not", async () => {
    const carried = Array.from({ length: 6 }, (_, index) => step(index + 1, { id: index < 3 ? `d${index + 1}` : `f${index + 1}` }));
    const wrong: AutomationStudioFlowBootstrapTestVerdict = { verdict: "no", observed: "the test read no cart", findings: [], spent: JUDGE_SPEND };
    const { input, requests } = harness([
      () => finished(carried),
      (request) => finished(request.repair!.seed.map((each) => ({ ...each, ranWith: { target: `rerun-${each.position}` } })))
    ], [() => wrong, () => YES]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ judge: { verdict: "no", observed: "the test read no cart" } });
  });

  it("proposes the Flow unverified when the judge had no cost left to judge with", async () => {
    const { input, judged } = harness(
      [() => finished(wholeFlow(), spent(40, 0.25))],
      [({ budget }) => (budget.maxCostUsd !== undefined && budget.maxCostUsd <= 0 ? { verdict: "not_judged", why: "no cost left", spent: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 } } : YES)]
    );

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(judged[0]!.budget.maxCostUsd).toBe(0);
    expect(outcome.kind).toBe("finished");
    expect(outcome.kind === "finished" && outcome.judged).toMatchObject({ verdict: "not_judged", why: "no cost left" });
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
