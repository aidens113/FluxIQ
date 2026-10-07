// A round that stopped short with a clean test of a changed Flow is judged
// before the build ends (t254's aim: a build with money left tests and judges
// before it ends; `../phases.ts`, `../reserve-judging.ts`).
//
// Live run `run-musp474o-e0ed7432`: round 1 finished and was judged no, still
// achievable, advice "widen the listing's where so Jonas Weber is kept". Round 2
// applied exactly that, then stopped short on refused repeats without
// `complete`. Its Flow -- different from round 1's -- was tested whole and ran
// clean, but was judged from the checklist alone: no progress was found against
// round 1's judged judgement, and the build ended `not_finished` with about
// $0.05 of its $0.10 purse unspent and that Flow never judged.
//
// On t262's judging reserve (bound by calls as well as money): the judge of a
// round that stopped short draws on the calls kept back for judging, and the
// yes it finishes on is recorded as `stopped_short` (`../finishing-verdict.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import {
  runAutomationStudioFlowBootstrapBuildPhases,
  type AutomationStudioFlowBootstrapBuildPhasesInput,
  type AutomationStudioFlowBootstrapRoundRequest,
  type AutomationStudioFlowBootstrapTestVerdict
} from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";
const SPENT = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 };

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

const spent = (iterations: number): AutomationStudioLlmEvidenceLoopAccounting => ({ iterations, toolCalls: iterations, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0.005 });

/** Round 0's Flow, every step worked in the loop's own test. */
const firstFlow = () => [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })]
  .map((each) => ({ ...each, replayed: { step: each.position, actionId: each.actionId, status: "replayed" as const } }));
/** The repair applies the judge's advice: the kettle saved from its own page, a different Flow. */
const changed = (seed: AutomationStudioFlowDraftStep[]) => [...seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle" } })];

const finished = (steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult => ({ ok: true, result: { summary: "Adds and saves." }, trace: [], steps, accounting: spent(2) });
const repeatsRefused = (steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult => ({ ok: false, code: "llm_evidence_loop.repeat_without_progress", trace: [], steps, accounting: spent(3) });
const outOfDecisions = (steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult => ({
  ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting: spent(3),
  exhaustion: { bound: "iterations", maxIterations: 64, iterations: 64, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [] }
});

/** Round 0's judge: no, still achievable, with the fix named. */
const NO_WITH_ADVICE = (flowSignature: string): AutomationStudioFlowBootstrapTestVerdict => ({
  verdict: "no", expected: "the kettle in saved items", observed: "the kettle was not saved", advice: "save the kettle from its own page", findings: ["result.acts_judged_undone"], stillAchievable: "yes", spent: SPENT, flowSignature
});
const YES = (flowSignature: string): AutomationStudioFlowBootstrapTestVerdict => ({ verdict: "yes", spent: SPENT, flowSignature });

type Verdict = (signature: string) => AutomationStudioFlowBootstrapTestVerdict;

async function build(rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>, verdicts: Verdict[], overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}) {
  const judged: Array<{ round: number; steps: string[] }> = [];
  const tests: Array<{ steps: string[]; judged: boolean }> = [];
  let requests = 0;
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases({
    round: async (request) => {
      const next = rounds[request.round];
      requests += 1;
      if (!next) throw new Error(`no round ${request.round} scripted`);
      return next(request);
    },
    judge: async ({ round, loop }) => {
      judged.push({ round, steps: loop.steps.map((each) => each.id ?? "") });
      const next = verdicts.shift();
      if (!next) throw new Error(`no verdict scripted for round ${round}`);
      return next(automationStudioFlowDraftFlowSignature(loop.steps));
    },
    test: async (steps, options) => {
      tests.push({ steps: steps.map((each) => each.id ?? ""), judged: options?.judged === true });
      for (const each of steps) each.replayed = { step: each.position, actionId: each.actionId, status: "replayed" };
      return undefined;
    },
    replayable: (steps) => steps.length > 0 && steps.every((each) => each.replay !== undefined),
    checklist: (steps) => automationStudioInstructedActsChecklist({ instructionText: INSTRUCTION, draftSteps: steps }),
    budget: { maxCostUsd: 0.1, maxDurationMs: 540_000 },
    maxIterations: 64,
    keep: async (...args) => ({ revision: 1, steps: (args[2] as unknown[]).length }),
    now: () => 0,
    ...overrides
  });
  return { outcome, judged, tests, requests: () => requests };
}

describe("a round that stopped short with a clean test of a changed Flow (run-musp474o-e0ed7432)", () => {
  it("is put to the judge, its test run for the judge, and a yes about that Flow finishes the build", async () => {
    const { outcome, judged, tests } = await build([() => finished(firstFlow()), (request) => repeatsRefused(changed(request.repair!.seed))], [NO_WITH_ADVICE, YES]);

    expect(tests).toEqual([{ steps: ["d1", "d2", "d9"], judged: true }]);
    expect(judged).toEqual([{ round: 0, steps: ["d1", "d2", "d3"] }, { round: 1, steps: ["d1", "d2", "d9"] }]);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2, judged: { verdict: "yes" } });
    // The yes it finished on is on record as a stopped round's, about the Flow it finished with.
    expect(outcome.kind === "finished" && outcome.finishing).toMatchObject({ verdict: "yes", round: 1, judgedAt: "stopped_short", matchesStandingFlow: true });
    expect(outcome.kind === "finished" && outcome.loop.result.summary).toContain("stopped short");
  });

  it("takes a no with the fix named as the round's judgement, and one more round follows", async () => {
    const { outcome, judged, requests } = await build(
      [() => finished(firstFlow()), (request) => repeatsRefused(changed(request.repair!.seed)), (request) => finished(request.repair!.seed)],
      [NO_WITH_ADVICE, NO_WITH_ADVICE, YES]
    );

    expect(judged.map((each) => each.round)).toEqual([0, 1, 2]);
    expect(requests()).toBe(3);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 3 });
  });

  it("ends not doable when that judge says what was asked can no longer be had", async () => {
    const { outcome, judged } = await build(
      [() => finished(firstFlow()), (request) => repeatsRefused(changed(request.repair!.seed))],
      [NO_WITH_ADVICE, (signature) => ({ ...(NO_WITH_ADVICE(signature) as Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "no" }>), stillAchievable: "no" })]
    );

    expect(judged.map((each) => each.round)).toEqual([0, 1]);
    expect(outcome).toMatchObject({ kind: "unfinished", ending: { kind: "not_doable" } });
  });

  it("does not judge again the very Flow a judge of this build said no to", async () => {
    const { outcome, judged, tests } = await build([() => finished(firstFlow()), (request) => outOfDecisions(request.repair!.seed)], [NO_WITH_ADVICE]);

    expect(judged.map((each) => each.round)).toEqual([0]);
    expect(tests).toEqual([{ steps: ["d1", "d2", "d3"], judged: false }]);
    expect(outcome).toMatchObject({ kind: "unfinished", ending: { kind: "not_finished" } });
  });

  it("judges it with the calls kept back for judging when the round left no call for anything else (t262)", async () => {
    // Three calls in all: the round's one decision, then the judging pair the purse keeps back from it.
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 1, maxCalls: 3 });
    const { outcome, judged } = await build([() => {
      const sent = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1 });
      if (sent.ok) sent.hold.settle();
      // A further decision would eat into the judging kept back; the round stops short on refused repeats instead.
      expect(purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1 }).ok).toBe(false);
      return repeatsRefused(firstFlow());
    }], [(signature) => {
      for (let call = 0; call < 2; call += 1) {
        const held = purse.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 1, maxOutputTokens: 1, judge: true });
        expect(held.ok).toBe(true);
        if (held.ok) held.hold.settle();
      }
      return YES(signature);
    }], { purse });

    expect(judged.map((each) => each.round)).toEqual([0]);
    expect(purse.spentCalls()).toBe(3);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 1, finishing: { round: 0, judgedAt: "stopped_short", matchesStandingFlow: true } });
  });

  it("does not judge a Flow whose test failed", async () => {
    const { outcome, judged } = await build([() => finished(firstFlow()), (request) => repeatsRefused(changed(request.repair!.seed))], [NO_WITH_ADVICE], {
      test: async () => ({ issueCodes: ["replay.target_missing"] })
    });

    expect(judged.map((each) => each.round)).toEqual([0]);
    expect(outcome.kind).toBe("unfinished");
  });
});

// U-B3-2 of run-mux6pndp-16feb842 (moment 14; also live-C-r3 moment 14): "Judging the Flow — The
// Flow so far ran clean from its start" was announced while six of its steps did not run (five
// unreproducible, one only checked). The announcement says how far the test got.
describe("the announcement before a stopped round's Flow is judged", () => {
  it("says ran clean only when every step ran, and otherwise how many ran and how many did not", async () => {
    for (const [outcomes, said] of [
      [["replayed", "replayed", "replayed"], "The Flow so far ran clean from its start. Judging what the test did against what you asked."],
      [["replayed", "verified", "unreproducible"], "The test ran 1 of the Flow's 3 steps from its start; 1 was only checked, not run, and 1 could not run. Judging what the test did against what you asked."]
    ] as const) {
      const announced: string[] = [];
      await build([() => finished(firstFlow()), (request) => repeatsRefused(changed(request.repair!.seed))], [NO_WITH_ADVICE, YES], {
        announce: ({ label, text }) => { if (label === "Judging the Flow") announced.push(text ?? ""); },
        test: async (steps) => {
          steps.forEach((each, index) => {
            const word = outcomes[index] ?? "replayed";
            each.replayed = word === "verified"
              ? { step: each.position, actionId: each.actionId, status: "replayed", mode: "verify", resultCode: "core.replay.verified" }
              : { step: each.position, actionId: each.actionId, status: word };
          });
          return undefined;
        }
      });
      expect(announced.at(-1)).toBe(said);
    }
  });
});
