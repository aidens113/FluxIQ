// A build's repair rounds are bounded by money and progress, not by a count
// (t240): another round opens only when the purse can fund its next decision
// and the judging of its Flow at their capped holds (run 38, cause C7), and the
// round before it measurably progressed; one that did not ends the build saying
// what stood still. A round that ended on refused repeats and handed back the
// Flow it started from ends it too (run 38, cause C8). Rounds and judges are
// scripted: each charges the purse it is handed as its calls would.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, automationStudioFlowDraftReplaySignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
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
const NOTHING_SPENT = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}

function spent(iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations, toolCalls: iterations, evidenceBytes: 100, inputTokens: 1_000 * iterations, cacheHitInputTokens: 0, outputTokens: 100 * iterations, totalTokens: 1_100 * iterations, estimatedCostUsd };
}

/** `count` calls made under the purse, each held at `heldUsd` (its capped worst case) and charged `costUsd`. */
function calls(purse: AutomationStudioLlmBuildPurse | undefined, count: number, heldUsd: number, costUsd: number): void {
  if (!purse) throw new Error("no purse was handed over");
  for (let index = 0; index < count; index += 1) {
    const held = purse.hold({ projectedCostUsd: heldUsd, estimatedInputTokens: 10_000, maxOutputTokens: 2_000 });
    if (!held.ok) throw new Error("the purse refused a call the test expected it to pay for");
    held.hold.settle({ estimatedCostUsd: costUsd });
  }
}

function outOfDecisions(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return {
    ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps, accounting,
    exhaustion: { bound: "iterations", maxIterations: 64, iterations: 64, draftSteps: steps.length, proposableSteps: steps.length, completionAttempts: 1, lastIssueCodes: [], outstandingIssueCodes: [] }
  };
}

/** The loop's no-progress guard stopped the round: its calls kept being refused as repeats. */
function repeatsRefused(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code: "llm_evidence_loop.repeat_without_progress", trace: [], steps, accounting };
}

function finished(steps: AutomationStudioFlowDraftStep[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps, accounting };
}

function wholeFlow(): AutomationStudioFlowDraftStep[] {
  return [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })];
}

function no(findings: string[], records?: { stored: number; refused: number; missingRequired: number }): AutomationStudioFlowBootstrapTestVerdict {
  return { verdict: "no", expected: "the towels in the cart", observed: "the test read no cart", findings, ...(records ? { records } : {}), spent: { ...NOTHING_SPENT, estimatedCostUsd: 0.001 } };
}

function harness(
  rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>,
  overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}
) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const input: AutomationStudioFlowBootstrapBuildPhasesInput = {
    round: async (request) => {
      requests.push(request);
      const next = rounds[requests.length - 1];
      if (!next) throw new Error(`no round ${requests.length - 1} scripted`);
      return next(request);
    },
    test: async (steps) => {
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
  };
  return { input, requests };
}

describe("a repair round opens only when the purse can fund it", () => {
  it("opens none the purse cannot fund for one decision plus a judge, though money is left, and says what it needed", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    // Five decisions held at $0.02 each, charged $0.017: $0.015 is left, under a decision and a judge at $0.02 each.
    const { input, requests } = harness([
      (request) => { calls(request.purse, 5, 0.02, 0.017); return outOfDecisions([step(1, { acts: ["a1"] })], spent(5, 0.085)); }
    ], { purse, judge: async ({ loop }) => ({ verdict: "yes", spent: NOTHING_SPENT, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) }) });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain(
      "it had spent $0.085, which left $0.015, too little for another round: its next decision and the judging of its Flow could cost up to $0.040."
    );
  });

  it("holds a judge at what the purse last priced it at: one more round opens while that fits, and none once it does not", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const { input, requests } = harness([
      // Decisions held at $0.02; $0.061 spent with the judge, so $0.039 is left for a $0.02 decision and a $0.005 judge.
      (request) => { calls(request.purse, 3, 0.02, 0.02); return finished(wholeFlow(), spent(3, 0.06)); },
      // $0.077 spent with the judge: $0.023 would hold a decision alone, but not a decision and the judge.
      (request) => { calls(request.purse, 1, 0.02, 0.015); return finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle" } })], spent(1, 0.015)); }
    ], {
      purse,
      judge: async ({ round }) => { calls(purse, 1, 0.005, 0.001); return no(round === 0 ? ["result.no_records_stored"] : ["result.required_values_missing"]); }
    });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("which left $0.023, too little for another round: its next decision and the judging of its Flow could cost up to $0.025.");
  });
});

describe("a repair round opens only after a round that measurably progressed", () => {
  it("ends not doable, saying what stood still, when a different Flow is judged wrong for the same findings", async () => {
    const { input, requests } = harness([
      () => finished(wholeFlow(), spent(2, 0.01)),
      // Navigation added, nothing more done: what the judge reports is unchanged (run-muqiho7e-13be6c03).
      (request) => finished([...request.repair!.seed, step(4, { id: "d9", actionId: "web.navigate", ranWith: { url: "https://shop.example/" } })], spent(2, 0.01))
    ], { judge: async () => no(["result.no_records_stored"]) });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "not_doable", tried: { rounds: 2 } });
    expect(outcome.ending.message).toContain(
      "and the last repair made no measurable progress on the round before it: no more of the 3 things you asked had a step (3, as before); the judge found the same as before."
    );
  });

  it("repairs on past two repairs while each progresses and the purse funds it", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    // Each round charges two decisions held at $0.005 and adds one step that works; the fourth finishes.
    const round = (add: AutomationStudioFlowDraftStep | undefined) => (request: AutomationStudioFlowBootstrapRoundRequest) => {
      calls(request.purse, 2, 0.005, 0.004);
      const steps = [...(request.repair?.seed ?? []), ...(add ? [add] : [])];
      return add ? outOfDecisions(steps, spent(2, 0.008)) : finished(steps, spent(2, 0.008));
    };
    const { input, requests } = harness([
      round(step(1, { acts: ["a1"] })),
      round(step(2, { id: "d12", acts: ["a1.quantity"], input: { quantity: "2" } })),
      round(step(3, { id: "d13", actionId: "web.navigate", ranWith: { url: "https://shop.example/saved" } })),
      (request) => { calls(request.purse, 2, 0.005, 0.004); return finished([...request.repair!.seed, step(4, { id: "d14", acts: ["a2"] })], spent(2, 0.008)); }
    ], { purse });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(4);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 4 });
    expect(requests.slice(1).every((request) => request.purse === purse)).toBe(true);
  });

  it("ends at the live-round backstop, as that, while every round still progresses", async () => {
    let added = 0;
    const growing = (request: AutomationStudioFlowBootstrapRoundRequest) => {
      added += 1;
      return outOfDecisions([...(request.repair?.seed ?? []), step(added, { id: `d${10 + added}`, acts: added === 1 ? ["a1"] : [] })], spent(10, 0.001));
    };
    const { input, requests } = harness([growing, growing, growing], { maxRounds: 3 });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(3);
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "rounds" });
  });
});

// Run 38's re-author round ended on refused repeats with its seeded Flow unchanged, and a second round repeated it exactly.
describe("a round that ended on refused repeats and handed back the Flow it started from", () => {
  const seeded = () => [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } })];

  it("ends an extend build's first round not doable, never opening an identical second round", async () => {
    const { input, requests } = harness([() => repeatsRefused(seeded(), spent(3, 0.008))], { seedSignature: automationStudioFlowDraftReplaySignature(seeded()) });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(1);
    expect(outcome.kind).toBe("unfinished");
    if (outcome.kind !== "unfinished") return;
    expect(outcome.ending).toMatchObject({ kind: "not_doable", tried: { rounds: 1, stepsInFlow: 2 } });
    expect(outcome.ending.message).toContain("and the last attempt ended on refused repeats of the same calls and handed back the Flow it started from, unchanged, so another round would only repeat it.");
  });

  it("ends a repair that handed back its seed unchanged the same way", async () => {
    const { input, requests } = harness([
      () => outOfDecisions(seeded(), spent(10, 0.01)),
      (request) => repeatsRefused(request.repair!.seed.map((each) => ({ ...each })), spent(3, 0.008))
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(requests).toHaveLength(2);
    expect(outcome.kind === "unfinished" && outcome.ending.message).toContain("and the last repair ended on refused repeats of the same calls and handed back the Flow it started from, unchanged");
  });

  it("still repairs a first round that changed the Flow it started from, or that started from none", async () => {
    const changed = harness([
      () => repeatsRefused([...seeded(), step(3, { acts: ["a2"] })], spent(3, 0.008)),
      (request) => finished(request.repair!.seed, spent(1, 0.001))
    ], { seedSignature: automationStudioFlowDraftReplaySignature(seeded()) });
    const fresh = harness([
      () => repeatsRefused(seeded(), spent(3, 0.008)),
      (request) => finished(request.repair!.seed, spent(1, 0.001))
    ]);

    expect(await runAutomationStudioFlowBootstrapBuildPhases(changed.input)).toMatchObject({ kind: "finished", rounds: 2 });
    expect(await runAutomationStudioFlowBootstrapBuildPhases(fresh.input)).toMatchObject({ kind: "finished", rounds: 2 });
  });
});

// What the judged test stored is measured too (t240): the judge returns its
// summary's counts on a no, so a repair that stored rows where none were, or
// refused fewer or left fewer incomplete while storing no fewer, progressed.
describe("a repair judged wrong for the same findings, measured by what its test stored", () => {
  /** Three rounds, each a different Flow; the first two judged no with these counts and the same finding, the third yes about its own test. */
  async function judgedTwice(first: { stored: number; refused: number; missingRequired: number }, second: { stored: number; refused: number; missingRequired: number }) {
    const verdicts: Array<(steps: readonly AutomationStudioFlowDraftStep[]) => AutomationStudioFlowBootstrapTestVerdict> = [
      () => no(["result.required_values_missing"], first),
      () => no(["result.required_values_missing"], second),
      (steps) => ({ verdict: "yes", spent: NOTHING_SPENT, flowSignature: automationStudioFlowDraftFlowSignature(steps) })
    ];
    const { input, requests } = harness([
      () => finished(wholeFlow(), spent(2, 0.01)),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle" } })], spent(2, 0.01)),
      (request) => finished([...request.repair!.seed.slice(0, 2), step(3, { id: "d10", acts: ["a2"], ranWith: { target: "kettle-card" } })], spent(2, 0.01))
    ], { judge: async ({ loop }) => verdicts.shift()!(loop.steps) });
    return { outcome: await runAutomationStudioFlowBootstrapBuildPhases(input), requests };
  }

  it("repairs again after a repair that refused fewer rows and stored no fewer", async () => {
    const { outcome, requests } = await judgedTwice({ stored: 4, refused: 5, missingRequired: 2 }, { stored: 4, refused: 1, missingRequired: 2 });
    expect(requests).toHaveLength(3);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 3 });
  });

  it("repairs again after a repair that left fewer stored rows missing a required value", async () => {
    const { outcome } = await judgedTwice({ stored: 6, refused: 0, missingRequired: 6 }, { stored: 6, refused: 0, missingRequired: 2 });
    expect(outcome).toMatchObject({ kind: "finished", rounds: 3 });
  });

  it("repairs again after a repair that stored rows where none were", async () => {
    const { outcome } = await judgedTwice({ stored: 0, refused: 0, missingRequired: 0 }, { stored: 3, refused: 0, missingRequired: 3 });
    expect(outcome).toMatchObject({ kind: "finished", rounds: 3 });
  });

  it("ends not doable when fewer rows were refused only because fewer were stored", async () => {
    const { outcome, requests } = await judgedTwice({ stored: 4, refused: 5, missingRequired: 0 }, { stored: 1, refused: 0, missingRequired: 0 });
    expect(requests).toHaveLength(2);
    expect(outcome.kind === "unfinished" && outcome.ending.kind).toBe("not_doable");
  });
});

// Live run muqk713g (Stage 6): no record said why each round stopped, so a
// debug could not tell whether these bounds fired. The ending's `tried` now
// carries each round's stop and, for "not doable", which no-route case ended it
// -- closed words only, which the run record and the Lab publish as they are.
describe("each round's stop, recorded on the ending", () => {
  const seeded = () => [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } })];

  it("records a repair that stopped on refused repeats, and the no-route case that ended the build", async () => {
    const { input } = harness([
      () => outOfDecisions(seeded(), spent(10, 0.01)),
      (request) => repeatsRefused(request.repair!.seed.map((each) => ({ ...each })), spent(3, 0.008))
    ]);

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind === "unfinished" && outcome.ending.tried).toEqual({
      rounds: 2, decisions: 13, stepsInFlow: 2, tested: "replayed_clean",
      stops: [{ round: 0, stopped: "iterations" }, { round: 1, stopped: "repeat_without_progress" }],
      noRoute: { kind: "repeated_unchanged" }
    });
  });

  it("records rounds judged wrong, and a repair that made no measurable progress", async () => {
    const { input } = harness([
      () => finished(wholeFlow(), spent(2, 0.01)),
      (request) => finished([...request.repair!.seed, step(4, { id: "d9", actionId: "web.navigate", ranWith: { url: "https://shop.example/" } })], spent(2, 0.01))
    ], { judge: async () => no(["result.no_records_stored"]) });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind === "unfinished" && outcome.ending.tried).toMatchObject({
      stops: [{ round: 0, stopped: "judged_wrong" }, { round: 1, stopped: "judged_wrong" }],
      noRoute: { kind: "no_progress" }
    });
  });

  it("records every round of a build a bound ended, with no no-route case", async () => {
    let added = 0;
    const growing = (request: AutomationStudioFlowBootstrapRoundRequest) => {
      added += 1;
      return outOfDecisions([...(request.repair?.seed ?? []), step(added, { id: `d${10 + added}`, acts: added === 1 ? ["a1"] : [] })], spent(10, 0.001));
    };
    const { input } = harness([growing, growing], { maxRounds: 2 });

    const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);

    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "rounds", tried: { stops: [{ round: 0, stopped: "iterations" }, { round: 1, stopped: "iterations" }] } });
    expect(outcome.kind === "unfinished" && outcome.ending.tried.noRoute).toBeUndefined();
  });
});
