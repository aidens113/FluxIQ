// A build whose exploration stops before the Flow is ready (audit A3, cause
// 1): tested, judged and repaired; a repair that gets no further ends it not
// finished, the Flow kept (t195-w37: "not doable" only on the judge's word that
// it can no longer be had); a budget that runs out said as exactly that.
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmStepLogScope, type AutomationStudioLlmEvidenceLoopAccounting, type AutomationStudioLlmEvidenceLoopResult, type AutomationStudioLlmStepLogContext } from "../../../llm/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
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

/** A step that carries nothing a replay needs. */
function withoutReplay(each: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep {
  const { replay: _replay, ...rest } = each;
  return rest;
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

  // Live run murwcmx2 (screenshot 00023, UI-4): "Testing the Flow so far ...
  // Running the Flow as far as it got" was said for a Flow nothing could replay,
  // and no test followed it.
  it("announces no test of a Flow so far that cannot be replayed, and runs none", async () => {
    const { input, tested, announced, requests } = harness([
      (request) => { throw request.stalled({ issueCodes: ["llm_evidence_loop.repeat_refused"], trace: [], accounting: spent(12, 0.02), steps: [withoutReplay(step(1, { acts: ["a1"] }))] }); },
      (request) => finished(request.repair!.seed)
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    expect(tested).toHaveLength(0);
    expect(requests[1]!.repair!.resume).toMatchObject({ judgement: { test: "not_tested" } });
    expect(announced).toEqual(["repairing: Repairing the Flow"]);
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

  it("ends not finished, never not doable, with the acts still to do, why, and what was tried, when a repair gets no further", async () => {
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
      kind: "not_finished",
      notDone: [{ id: "a1.quantity", todo: "no_step_added" }, { id: "a2", todo: "no_step_added" }],
      tried: { rounds: 2, decisions: 76, stepsInFlow: 1, tested: "replayed_clean" }
    });
    expect(outcome.ending.notDone[1]!.quote).toContain("Brightline kettle");
    // A message the person reads, in their own words, with no code in it.
    expect(outcome.ending.message).toMatch(/^I have not finished this Flow yet\. My last attempt to fix it got no further than the one before: the Flow came out exactly the same, no more of what you asked has a step than before, and no more of its steps worked when it was run from the start\./u);
    expect(outcome.ending.message).not.toContain("found no way");
    expect(outcome.ending.message).toContain("\"save the Brightline kettle to my saved items\": nothing I tried did it");
    // Two of three things asked are not done, so the clean run is not said to be without failing.
    expect(outcome.ending.message).toContain("ran from its start, but it does not yet do all you asked");
    expect(outcome.ending.message).not.toContain("without failing");
    expect(outcome.ending.message).toContain("I worked on it live twice: first exploring the page, then fixing it once after testing what I had.");
    expect(outcome.ending.message).toContain("The steps I found so far were kept as a draft, so building again carries on from them.");
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
    expect(outcome.ending.message).toMatch(/^The build used its budget for this Flow before the Flow was finished\. It used all of its spending limit of \$0\.25\. 1 of the 3 things you asked has a step in the Flow, not yet shown to work by running it/u);
    expect(outcome.ending.message).toContain("The steps I found so far were kept as a draft, so building again carries on from them.");
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

  // The ending's record is the whole build's, not the last round's: a build
  // that explored again after a stall published the second round's decisions
  // beside the whole build's tokens, and the first round's were gone (t214).
  // A Flow accepted after a repair keeps the exploration's decisions too: its
  // stored record was the repair's alone (t214).
  it("finishes with every round's record, its decisions numbered across the build", async () => {
    const partial = [step(1, { acts: ["a1"] })];
    const { input } = harness([
      () => ({ ...outOfDecisions(partial, spent(3, 0.01)), trace: [{ iteration: 0, decision: "tool_call", toolId: "demo.look" }, { iteration: 1, decision: "tool_call", toolId: "web.dom.click" }, { iteration: 2, decision: "complete" }, { iteration: 3, decision: "complete" }] }),
      (request) => ({ ...finished([...request.repair!.seed, step(2, { id: "d9", acts: ["a1.quantity"] }), step(3, { id: "d10", acts: ["a2"] })], spent(2, 0.01)), trace: [{ iteration: 1, decision: "tool_call", toolId: "web.dom.click" }, { iteration: 2, decision: "complete" }] })
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("finished");
    if (outcome.kind !== "finished") return;
    expect(outcome.trace.map((row) => row.iteration)).toEqual([0, 1, 2, 3, 4, 5]);
    // The loop's own result is still the last round's: what the Flow was accepted from.
    expect(outcome.loop.trace.map((row) => row.iteration)).toEqual([1, 2]);
    expect(outcome.accounting).toMatchObject({ iterations: 5 });
  });

  it("ends with every round's record, its decisions numbered across the build", async () => {
    const empty = (request: AutomationStudioFlowBootstrapRoundRequest) => {
      throw request.stalled({
        issueCodes: ["llm.provider_malformed_response"],
        trace: [{ iteration: 0, decision: "tool_call", toolId: "demo.look" }, { iteration: 1, decision: "unusable" }, { iteration: 2, decision: "unusable" }],
        accounting: spent(2, 0.01),
        steps: []
      });
    };
    const { input } = harness([empty, empty, empty], { maxRounds: 3 });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.progress.trace.map((row) => row.iteration)).toEqual([0, 1, 2, 0, 3, 4, 0, 5, 6]);
    expect(outcome.progress.accounting).toEqual(outcome.accounting);
    expect(outcome.progress.accounting).toMatchObject({ iterations: 6, totalTokens: 6_600 });
    expect(outcome.ending.tried).toMatchObject({ rounds: 3, decisions: 6 });
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
    expect(outcome.ending.message).toMatch(/^The build used its budget for this Flow before the Flow was finished\. It used all of its spending limit of \$0\.25\. None of the 3 things you asked is done; still to do: /u);
    expect(outcome.ending.message).toContain("No step I found belonged in the Flow. I worked on it live once, exploring the page. What held it up was that the Flow did not yet do what you asked. Nothing was kept to carry on from.");
  });

  it.each(["llm_evidence_loop.cancelled", "llm_evidence_loop.invalid_configuration", "llm_evidence_loop.evidence_limit"] as const)("retains every round when a later round ends %s", async (code) => {
    const first = { ...outOfDecisions([], spent(2, 0.01)), trace: [{ iteration: 0, decision: "tool_call" as const, toolId: "demo.look" }, { iteration: 1, decision: "complete" as const }, { iteration: 2, decision: "complete" as const }] };
    const refusedBeforeStarting = code === "llm_evidence_loop.invalid_configuration";
    const last: AutomationStudioLlmEvidenceLoopResult = { ok: false, code, trace: refusedBeforeStarting ? [] : [{ iteration: 0, decision: "tool_call", toolId: "demo.look" }, { iteration: 1, decision: "unusable" }], steps: [], accounting: spent(refusedBeforeStarting ? 0 : 1, 0.01) };
    const { input, requests } = harness([() => first, () => last]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("ended");
    if (outcome.kind !== "ended") return;
    expect(outcome.loop).toBe(last);
    expect(outcome.trace.map((row) => row.iteration)).toEqual(refusedBeforeStarting ? [0, 1, 2] : [0, 1, 2, 0, 3]);
    expect(last.trace.map((row) => row.iteration)).toEqual(refusedBeforeStarting ? [] : [0, 1]);
    expect(outcome.accounting).toMatchObject({ iterations: refusedBeforeStarting ? 2 : 3, totalTokens: refusedBeforeStarting ? 2_200 : 3_300 });
    expect(outcome.rounds).toBe(2);
    expect(requests).toHaveLength(2);
  });

  it("retains earlier rounds when judgement is cancelled without duplicating the current round", async () => {
    let tests = 0;
    const partial = [step(1, { acts: ["a1"] })];
    const round = () => ({ ...outOfDecisions(partial, spent(1, 0.01)), trace: [{ iteration: 1, decision: "complete" as const }] });
    const { input } = harness([round, round], { test: async () => ++tests === 2 ? "cancelled" : undefined });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind).toBe("ended");
    if (outcome.kind !== "ended") return;
    expect(outcome.loop.code).toBe("llm_evidence_loop.cancelled");
    expect(outcome.trace.map((row) => row.iteration)).toEqual([1, 2]);
    expect(outcome.accounting).toMatchObject({ iterations: 2, totalTokens: 2_200 });
  });

  it("gives a caller-owned ending the whole build's progress before it publishes the failure", async () => {
    const asked = new Error("permission asked");
    let calls = 0;
    const round = () => ({ ...outOfDecisions([], spent(1, 0.01)), trace: [{ iteration: 1, decision: "complete" as const }] });
    const { input } = harness([round, round], {
      callerEnding: (progress) => {
        if (++calls < 2) return undefined;
        expect(progress.trace.map((row) => row.iteration)).toEqual([1, 2]);
        expect(progress.accounting).toMatchObject({ iterations: 2, totalTokens: 2_200 });
        return asked;
      }
    });

    await expect(runAutomationStudioFlowBootstrapBuildPhases(input)).rejects.toBe(asked);
    expect(calls).toBe(2);
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

// The step log (`../../../llm/step-log/`) writes each step under the round and
// phase the build's phases set around each round and each test.
describe("the round and phase every step of a build is written under", () => {
  it("is the exploration for round 0, the test for its Flow test, and the repair for a seeded round", async () => {
    const saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = path.join(tmpdir(), `fluxiq-phases-scope-${process.pid}-unused`);
    const seen: Array<AutomationStudioLlmStepLogContext | undefined> = [];
    try {
      const partial = [step(1, { acts: ["a1"] })];
      const { input } = harness([
        () => { seen.push(automationStudioLlmStepLogScope.current()); return outOfDecisions(partial); },
        (request) => { seen.push(automationStudioLlmStepLogScope.current()); return finished(request.repair!.seed); }
      ], {
        test: async () => { seen.push(automationStudioLlmStepLogScope.current()); return undefined; }
      });
      await expect(runAutomationStudioFlowBootstrapBuildPhases(input)).resolves.toMatchObject({ kind: "finished" });
    } finally {
      if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
      else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
    }
    expect(seen).toEqual([{ round: 0, phase: "explore" }, { round: 0, phase: "test" }, { round: 1, phase: "repair" }]);
    expect(automationStudioLlmStepLogScope.current()).toBeUndefined();
  });
});


it("keeps reader and both repair rounds on one logical call allowance", async () => {
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 3 });
  const send = () => {
    const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1 });
    expect(held.ok).toBe(true);
    if (held.ok) held.hold.settle();
  };
  send(); // The reader shares the creation purse before exploration.
  const partial = [step(1, { acts: ["a1"] })];
  const { input, requests } = harness([
    () => { send(); return outOfDecisions(partial, spent(1, 0.001)); },
    (request) => { send(); return finished([...request.repair!.seed, step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })], spent(1, 0.001)); }
  ], { purse });
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);
  expect(outcome.kind).toBe("finished");
  expect(requests).toHaveLength(2);
  expect(purse.spentCalls()).toBe(3);
  expect(purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1 })).toMatchObject({ ok: false, refusal: { code: "llm_budget.run_call_limit", spentCalls: 3 } });
});
