// A build whose exploration stops before the Flow is ready (audit A3, cause
// 1): tested, judged and repaired; "not doable" only when a repair gets no
// further; a budget that runs out said as exactly that.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  AutomationStudioFlowBootstrapUnfinishedStall,
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

function spent(iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd };
}

/** The loop ran out of decisions: its backstop, not a budget. */
function outOfDecisions(steps: AutomationStudioFlowDraftStep[], accounting = spent(64, 0.08)): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting,
    exhaustion: { bound: "iterations", maxIterations: 64, iterations: 64, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 9, lastIssueCodes: ["bootstrap.instructed_act_missing"], outstandingIssueCodes: ["bootstrap.instructed_act_missing"] }
  };
}

function finished(steps: AutomationStudioFlowDraftStep[], accounting = spent(10, 0.03)): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps, accounting };
}

function harness(rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>, overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const tested: AutomationStudioFlowDraftStep[][] = [];
  const kept: unknown[][] = [];
  const announced: string[] = [];
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => {
      requests.push(request);
      const next = rounds[requests.length - 1];
      if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
      return next(request);
    },
    test: async (steps) => {
      tested.push(steps.map((each) => ({ ...each })));
      for (const each of steps) each.replayed = { step: each.position, actionId: each.actionId, status: "replayed" };
      return undefined;
    },
    replayable: (steps) => steps.length > 0 && steps.every((each) => each.replay !== undefined),
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.25, maxDurationMs: 540_000 },
    maxIterations: 64,
    keep: async (...args) => { kept.push(args); return { revision: 1, steps: (args[2] as unknown[]).length }; },
    announce: ({ phase, label }) => { announced.push(`${phase}: ${label}`); },
    now: () => 0,
    ...overrides
  };
  return { input, requests, tested, kept, announced };
}

describe("a build whose exploration stops before the Flow is ready", () => {
  it("tests and judges a partial draft that hit the decision limit, then repairs it live with the checklist", async () => {
    // The exploration added the towels to the cart as a1, but chose no quantity and never saved the kettle.
    const partial = [step(1, { disposition: "taken", effect: "observe" }), step(2, { acts: ["a1"] })];
    const { input, requests, tested, announced } = harness([
      () => outOfDecisions(partial),
      (request) => finished([...request.repair!.seed, step(2, { id: "d9", position: 2, acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { id: "d10", acts: ["a2"] })])
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(outcome.rounds).toBe(2);
    // Phase 2: the Flow as far as it got -- its one step in the Flow, not the look -- was run from its start.
    expect(tested).toHaveLength(1);
    expect(tested[0]!.map((each) => [each.id, each.position, each.callId])).toEqual([["d2", 1, undefined]]);
    // Phase 3: the repair starts from that Flow, told what the test found and what is still to do.
    const repair = requests[1]!.repair!;
    expect(repair.seed.map((each) => [each.id, each.acts, each.replayed?.status])).toEqual([["d2", ["a1"], "replayed"]]);
    expect(repair.resume).toMatchObject({ stopped: "iterations", judgement: { test: "replayed_clean", stepsInFlow: 1, actsDone: 1, actsTodo: ["a1.quantity", "a2"] } });
    expect(announced).toEqual(["verifying: Testing the Flow so far", "repairing: Repairing the Flow"]);
    // The repair meets the decision backstop afresh, and spends only what the exploration left of the build's $0.25.
    expect(requests[1]!.maxIterations).toBe(64);
    expect(requests[1]!.budget.maxCostUsd).toBeCloseTo(0.17, 5);
    expect(outcome.accounting).toMatchObject({ iterations: 74 });
    expect(outcome.accounting.estimatedCostUsd).toBeCloseTo(0.11, 5);
  });

  it("repairs a round whose decisions kept coming back unusable, from the draft it stood at", async () => {
    const { input, requests } = harness([
      (request) => { throw request.stalled({ issueCodes: ["bootstrap.instructed_act_missing"], trace: [], accounting: spent(20, 0.04), steps: [step(1, { acts: ["a1"] })] }); },
      (request) => finished(request.repair!.seed)
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(requests[1]!.repair!.resume).toMatchObject({ stopped: "unusable_decisions", outstandingIssueCodes: ["bootstrap.instructed_act_missing"] });
  });

  it("ends not doable, with the acts that cannot be done, why, and what was tried, when a repair gets no further", async () => {
    const partial = [step(1, { acts: ["a1"] })];
    const { input, requests, kept } = harness([
      () => outOfDecisions(partial),
      (request) => { throw request.stalled({ issueCodes: ["bootstrap.instructed_act_missing"], trace: [], accounting: spent(12, 0.02), steps: request.repair!.seed }); }
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({
      kind: "not_doable",
      notDone: [{ id: "a1.quantity", todo: "no_step_added" }, { id: "a2", todo: "no_step_added" }],
      tried: { rounds: 2, decisions: 76, stepsInFlow: 1, tested: "replayed_clean" }
    });
    expect(outcome.ending.notDone[1]!.quote).toContain("Brightline kettle");
    // A message the person reads, in their own words, with no code in it.
    expect(outcome.ending.message).toMatch(/^I could not build this Flow, and I found no way to: 2 of the 3 things you asked could not be done/u);
    expect(outcome.ending.message).toContain("\"save the Brightline kettle to my saved items\": nothing I tried did it");
    expect(outcome.ending.message).toContain("ran from its start without failing");
    expect(outcome.ending.message).toContain("I tried 2 times live -- exploring, then one repair after testing what I had -- over 76 decisions");
    expect(outcome.ending.message).not.toMatch(/[a-z]+_[a-z]+|bootstrap\./u);
    expect(outcome.ending.message.length).toBeLessThanOrEqual(1_000);
    expect(outcome.kept).toEqual({ revision: 1, steps: 1 });
    expect(kept[0]![0]).toBe("unusable_decisions");
  });

  it("reports a spend ceiling hit as a budget hit, never as not doable, and runs nothing more", async () => {
    const { input, requests, tested, announced } = harness([
      () => ({
        ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps: [step(1, { acts: ["a1"] })], accounting: spent(40, 0.25),
        exhaustion: { bound: "budget", budgetBound: "cost", maxIterations: 64, iterations: 40, draftSteps: 1, proposableSteps: 1, completionAttempts: 2, lastIssueCodes: [], outstandingIssueCodes: [] }
      })
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(tested).toHaveLength(0);
    expect(announced).toEqual([]);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost", tried: { rounds: 1, tested: "not_tested" } });
    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished\. 1 of the 3 things you asked are done/u);
    expect(outcome.ending.message).toContain("The Flow so far was kept, and building again carries on from it.");
    expect(outcome.ending.message).not.toContain("not doable");
  });

  it("reports the budget, not not-doable, when a stopped exploration left nothing to repair with", async () => {
    const { input, requests, tested } = harness([() => outOfDecisions([step(1, { acts: ["a1"] })], spent(64, 0.25))]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    // Phase 2 still ran -- it costs no provider call -- but no repair was started with no money left.
    expect(tested).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost", tried: { tested: "replayed_clean" } });
  });

  it("holds a declared call count across every round", async () => {
    const { input, requests } = harness([
      () => outOfDecisions([step(1, { acts: ["a1"] })], spent(30, 0.05)),
      (request) => finished(request.repair!.seed)
    ], { declaredCalls: 48, maxIterations: 48 });

    await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests[1]!.maxIterations).toBe(18);
  });

  it("says a repair that is still getting further at its last round ran out of repairs, not that the task cannot be done", async () => {
    let added = 1;
    const growing = (request: AutomationStudioFlowBootstrapRoundRequest) => {
      added += 1;
      return outOfDecisions([...(request.repair?.seed ?? []), step(added, { id: `d${10 + added}`, acts: added === 2 ? ["a1"] : [] })], spent(10, 0.01));
    };
    const { input, requests } = harness([growing, growing, growing], { maxRepairRounds: 2 });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(3);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "repair_rounds" });
  });

  it("keeps an empty draft exploring live while budget remains, told plainly that nothing is in the Flow yet", async () => {
    const { input, requests, tested, announced } = harness([
      // Every completion refused and nothing added: the old `evidence_unusable_decision` ending.
      (request) => { throw request.stalled({ issueCodes: ["bootstrap.instructed_act_missing"], trace: [], accounting: spent(20, 0.04), steps: [step(1, { disposition: "taken", effect: "observe" })] }); },
      (request) => finished([step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })])
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    // Nothing to run, so no test; the second round starts from an empty Flow, from the page as it stands.
    expect(tested).toHaveLength(0);
    expect(requests[1]!.repair!.seed).toEqual([]);
    expect(requests[1]!.repair!.resume).toMatchObject({
      stopped: "unusable_decisions",
      judgement: { stepsInFlow: 0, actsDone: 0, actsTodo: ["a1", "a1.quantity", "a2"], lastRefusedFor: ["bootstrap.instructed_act_missing"] }
    });
    expect(announced).toEqual(["exploring: Exploring again"]);
  });

  it("never ends an empty draft not doable: it explores again until a budget ends it, and says so", async () => {
    const empty = (request: AutomationStudioFlowBootstrapRoundRequest) => { throw request.stalled({ issueCodes: ["bootstrap.instructed_act_missing"], trace: [], accounting: spent(12, 0.01), steps: [] }); };
    const { input, requests } = harness([empty, empty, empty], { maxRounds: 3 });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(3);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "rounds", tried: { rounds: 3, decisions: 36, stepsInFlow: 0 } });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("its limit of 3 live rounds");
  });

  it("ends an empty draft at the budget as a budget hit, with what was tried, how far it got and what blocked it", async () => {
    const { input, requests, kept } = harness([
      (request) => { throw request.stalled({ issueCodes: ["bootstrap.instructed_act_missing"], trace: [], accounting: spent(40, 0.25), steps: [] }); }
    ]);
    input.keep = async (...args) => { kept.push(args); return undefined; };

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost", notDone: [{ id: "a1" }, { id: "a1.quantity" }, { id: "a2" }], tried: { rounds: 1, decisions: 40, stepsInFlow: 0, tested: "not_tested" } });
    expect(outcome.ending.message).toMatch(/^The build stopped at its spending limit of \$0\.25 before the Flow was finished\. 0 of the 3 things you asked are done; still to do: /u);
    expect(outcome.ending.message).toContain("No step I found belonged in the Flow. I explored live once over 40 decisions, and what held it up was that the Flow did not yet do what you asked. Nothing was kept to carry on from.");
  });

  it("passes every ending it does not reach past through untouched", async () => {
    const asked = new Error("permission asked");
    const { input } = harness([() => { throw asked; }]);
    await expect(runAutomationStudioFlowBootstrapBuildPhases(input)).rejects.toBe(asked);

    const cancelled: AutomationStudioLlmEvidenceLoopResult = { ok: false, code: "llm_evidence_loop.cancelled", trace: [], steps: [], accounting: spent(3, 0.01) };
    const other = harness([() => cancelled]);
    expect(await runAutomationStudioFlowBootstrapBuildPhases(other.input)).toMatchObject({ kind: "ended", loop: { code: "llm_evidence_loop.cancelled" } });
  });

  it("is the stall the loop throws, so a caller's own stall endings are never mistaken for it", () => {
    const stall = new AutomationStudioFlowBootstrapUnfinishedStall({ issueCodes: [], trace: [], accounting: spent(1, 0), steps: [] });
    expect(stall).toBeInstanceOf(Error);
    expect(stall.name).toBe("AutomationStudioFlowBootstrapUnfinishedStall");
  });
});
