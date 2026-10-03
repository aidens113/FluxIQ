// A round whose Flow holds steps carried from an earlier Flow that never ran in
// this build has no test to measure it by, so "not doable" is never concluded
// from it (live run murwcmx2, cause C-F, t194-w70).
//
// The re-author seeds its draft from the stored Flow
// (`../../../llm/node-tools/draft-from-flow.ts`): steps `f<n>`, with nothing they
// ran with and nothing to put the page back with. Core must not run them itself
// (the permission gate reads their absent declaration as "no consequence"), so
// such a Flow is not tested at a round's end. Its round 0 stopped on unusable
// decisions with the advised fix rerun in its draft, round 1 likewise, and the
// build ended `not_doable` / `no_progress` comparing two untested judgements: the
// fix was never run from the Flow's start. Now such a round is told which steps
// have not run, progress is fewer of them or a changed Flow, the rounds go on
// while money and rounds allow, and an ending that comes then says the Flow as
// it stands was never run whole.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, automationStudioFlowDraftReplaySignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowDraftStepCarried, type AutomationStudioLlmEvidenceLoopAccounting, type AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import {
  automationStudioFlowBootstrapJudgeUnfinished,
  automationStudioFlowBootstrapJudgementProgress,
  automationStudioFlowBootstrapJudgementValue,
  automationStudioFlowBootstrapStepsNotRunInThisBuild,
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapBuildPhasesInput,
  type AutomationStudioFlowBootstrapJudgement,
  type AutomationStudioFlowBootstrapRoundRequest
} from "../index.ts";

const NOTHING_SPENT = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

/** A step carried from the stored Flow, as the re-author seeds it: no `ranWith`, no `replay`. */
function carried(position: number): AutomationStudioFlowDraftStep {
  return { position, id: `f${position}`, iteration: 0, actionId: "web.dom.click", input: { node: "web.dom.click", parameters: { target: `t${position}` } }, effect: "mutate", proposes: true, disposition: "kept" };
}

/** A step run live in this build: a rerun of the carried step it stands for, or a new one. */
function ran(position: number, id: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id, iteration: position, callId: `c${id}`, actionId: "web.dom.click", input: { node: "web.dom.click", parameters: { target: `t${position}` } }, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: `p${position}` } }, ...overrides
  };
}

function spent(iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd };
}

function finished(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Reads the list." }, trace: [], steps, accounting };
}

function repeatsRefused(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code: "llm_evidence_loop.repeat_without_progress", trace: [], steps, accounting };
}

/** The stored Flow the re-author starts from: three carried steps. */
function storedFlow(): AutomationStudioFlowDraftStep[] {
  return [carried(1), carried(2), carried(3)];
}

/** Round 0 of murwcmx2: the read (step 3) rerun with the advised fix, steps 1 and 2 still carried. */
function fixRerun(): AutomationStudioFlowDraftStep[] {
  return [carried(1), carried(2), ran(3, "d7", { standsFor: "f3", ranWith: { target: "t3", where: "relaxed" } })];
}

function harness(rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>, overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const tested: AutomationStudioFlowDraftStep[][] = [];
  const announced: string[] = [];
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => {
      requests.push(request);
      const next = rounds[requests.length - 1];
      if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
      return next(request);
    },
    test: async (steps) => {
      tested.push(steps);
      for (const each of steps) each.replayed = { step: each.position, actionId: each.actionId, status: "replayed" };
      return undefined;
    },
    // As `automationStudioFlowDraftReplayable`: every proposed step ran with something and can be put back.
    replayable: (steps) => steps.length > 0 && steps.every((each) => each.ranWith !== undefined && each.replay !== undefined),
    // A read asks for no act: the checklist is empty, as in murwcmx2 (`actsTodo: []`).
    checklist: () => [],
    budget: { maxCostUsd: 0.1, maxDurationMs: 540_000 },
    maxIterations: 64,
    keep: async (...args) => ({ revision: 1, steps: (args[2] as unknown[]).length }),
    announce: ({ text }) => { announced.push(text); },
    seedSignature: automationStudioFlowDraftReplaySignature(storedFlow()),
    now: () => 0,
    ...overrides
  };
  return { input, requests, tested, announced };
}

const stall = (request: AutomationStudioFlowBootstrapRoundRequest, steps: AutomationStudioFlowDraftStep[]): never => {
  throw request.stalled({ issueCodes: ["llm_evidence_loop.repeat_refused"], trace: [], accounting: spent(6, 0.02), steps });
};

describe("a round whose Flow holds steps that never ran in this build", () => {
  it("is judged with those steps named, and never tested", async () => {
    const judged = await automationStudioFlowBootstrapJudgeUnfinished({
      round: 0, stopped: "unusable_decisions", steps: fixRerun(), lastIssueCodes: [],
      test: async () => { throw new Error("a Flow with carried steps never run is never tested by Core"); },
      replayable: (steps) => steps.every((each) => each.ranWith !== undefined && each.replay !== undefined),
      checklist: () => []
    });
    expect(judged.kind).toBe("judged");
    if (judged.kind !== "judged") return;
    expect(judged.judgement).toMatchObject({ tested: "not_tested", stepsInFlow: 3, notRunInThisBuild: [1, 2] });
    expect(automationStudioFlowBootstrapJudgementValue(judged.judgement)).toMatchObject({ test: "not_tested", notRunInThisBuild: [1, 2] });
  });

  it("names none when every step ran in this build", async () => {
    const judged = await automationStudioFlowBootstrapJudgeUnfinished({ round: 0, stopped: "iterations", steps: [ran(1, "d1"), ran(2, "d2")], lastIssueCodes: [], replayable: () => false, checklist: () => [] });
    expect(judged.kind === "judged" && judged.judgement.notRunInThisBuild).toBeUndefined();
    expect(judged.kind === "judged" && automationStudioFlowBootstrapJudgementValue(judged.judgement).notRunInThisBuild).toBeUndefined();
  });

  it("does not end the build not doable when two such rounds measured nothing (murwcmx2 re-author)", async () => {
    const { input, requests, tested, announced } = harness([
      (request) => stall(request, fixRerun()),
      (request) => stall(request, request.repair!.seed.map((each) => structuredClone(each))),
      // The third round, told which steps have not run, reruns them and completes.
      (request) => finished([ran(1, "d10", { standsFor: "f1" }), ran(2, "d11", { standsFor: "f2" }), ...request.repair!.seed.slice(2)], spent(4, 0.01))
    ], { judge: async ({ loop }) => ({ verdict: "yes", spent: NOTHING_SPENT, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) }) });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome).toMatchObject({ kind: "finished", rounds: 3 });
    expect(requests).toHaveLength(3);
    // Core never ran the carried steps itself.
    expect(tested).toHaveLength(0);
    // Each repair is told which steps have not run in this build.
    expect(requests[1]!.repair!.resume.judgement).toMatchObject({ test: "not_tested", notRunInThisBuild: [1, 2] });
    expect(requests[2]!.repair!.resume.judgement).toMatchObject({ test: "not_tested", notRunInThisBuild: [1, 2] });
    // The person is told the same, and never that a test runs that does not (UI-4).
    expect(announced.filter((text) => text.startsWith("Running the Flow") || text.includes("Running the Flow as far as it got"))).toEqual([]);
    expect(announced).toContain("The Flow could not be tested from its start: steps 1 and 2 came from the Flow being changed and have not run in this build. Repairing it live, running each again so the whole Flow can be tested and judged.");
    expect(announced).toContain("The Flow could not be tested from its start: steps 1 and 2 came from the Flow being changed and have not run in this build. The last round ran none of them again. Repairing it live, running each again so the whole Flow can be tested and judged.");
  });

  it("does not end the build on a round that handed back the carried Flow unchanged on refused repeats", async () => {
    const { input, requests } = harness([
      () => repeatsRefused(storedFlow(), spent(3, 0.008)),
      (request) => finished(request.repair!.seed.map((each) => ran(each.position, `d${each.position + 20}`, { standsFor: String(each.id) })), spent(4, 0.01))
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
  });

  it("ends at the round limit, saying the Flow as it stands was never run whole, never not doable", async () => {
    const { input, requests } = harness([
      (request) => stall(request, fixRerun()),
      (request) => stall(request, request.repair!.seed.map((each) => structuredClone(each))),
      (request) => stall(request, request.repair!.seed.map((each) => structuredClone(each)))
    ], { maxRounds: 3 });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(3);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "rounds", tried: { tested: "not_tested", stepsInFlow: 3 } });
    expect(outcome.ending.message).toContain("The Flow as it stands (3 steps) was never run whole from its start: steps 1 and 2 came from the Flow being changed and were not run again in this build, so it was never tested or judged.");
  });

  // Merged with t195-w37 (2026-10-03): a measured stall still ends the build, but "not finished" -- "not doable"
  // only when the judge says what was asked can no longer be had.
  it("still ends the build on a measured round that got no further than the measured round before it, as not finished", async () => {
    const whole = () => [ran(1, "d1"), ran(2, "d2")];
    const { input } = harness([
      (request) => stall(request, whole()),
      (request) => stall(request, request.repair!.seed.map((each) => structuredClone(each)))
    ], { seedSignature: undefined });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "not_finished", tried: { noRoute: { kind: "no_progress" } } });
  });
});

describe("which steps have not run in this build", () => {
  it("are the carried steps the seed named f<n>, exactly as the seed's own test reads a carried step, and not reruns of them", () => {
    const ids = ["f1", "f12", "f0", "d3", "f", "xf1", "f1a", "seed"];
    const steps = ids.map((id, index) => ({ ...carried(index + 1), id }));
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(steps)).toEqual(steps.filter((each) => automationStudioFlowDraftStepCarried(each)).map((each) => each.position));
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(steps)).toEqual([1, 2]);
    // A carried step rerun in place with what it ran with and where it starts has run.
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild([ran(1, "f1"), carried(2)])).toEqual([2]);
  });
});

describe("what counts as progress for a round that could not be measured", () => {
  const judgement = (overrides: Partial<AutomationStudioFlowBootstrapJudgement>): AutomationStudioFlowBootstrapJudgement => ({
    round: 0, stopped: "unusable_decisions", tested: "not_tested", testIssueCodes: [], failedSteps: [], stepsInFlow: 3, done: 0, todo: [], lastIssueCodes: [], flowSignature: "a", ...overrides
  });

  it("is fewer steps not run in this build, or a changed Flow", () => {
    expect(automationStudioFlowBootstrapJudgementProgress(judgement({ notRunInThisBuild: [1, 2, 3] }), judgement({ notRunInThisBuild: [1, 2], flowSignature: "a" }))).toContain("fewer_steps_not_run");
    expect(automationStudioFlowBootstrapJudgementProgress(judgement({ notRunInThisBuild: [1, 2] }), judgement({ notRunInThisBuild: [1, 2], flowSignature: "b" }))).toContain("flow_changed_unmeasured");
    expect(automationStudioFlowBootstrapJudgementProgress(judgement({ notRunInThisBuild: [1, 2] }), judgement({ notRunInThisBuild: [1, 2] }))).toEqual([]);
  });

  it("is never a changed Flow alone between two measured rounds", () => {
    expect(automationStudioFlowBootstrapJudgementProgress(judgement({ tested: "replay_failed", failedSteps: [2] }), judgement({ tested: "replay_failed", failedSteps: [2], flowSignature: "b" }))).toEqual([]);
  });
});
