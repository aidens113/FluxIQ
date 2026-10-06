// A round without measured progress is not "not doable" (t195-w37, cause R11).
//
// Live run `run-murwcaj0-40e56557`: round 0's judge said no, still achievable,
// add a read after the confirm loop; round 1's judge said no, still achievable,
// with a different finding (the confirm acts on Tom Becker) and its fix. The
// build then ended "I could not build this Flow, and I found no way to ... the
// judge found the same as before", with $0.0106 of its $0.10 purse left. The
// user's rule: a build ends "not doable" only if there is absolutely no way.
// Now only the judge saying the result can no longer be had ends it so; a
// round without progress after a judge who named the fix gets one more round,
// and two in a row end it unfinished, the Flow kept, with what is left to do.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftReplaySignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { parseAutomationStudioFlowBootstrapBuildEnding } from "../../generation-failure/index.ts";
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

function finished(steps: AutomationStudioFlowDraftStep[], accounting = spent(2, 0.01)): AutomationStudioLlmEvidenceLoopResult {
  return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps, accounting };
}

function repeatsRefused(steps: AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code: "llm_evidence_loop.repeat_without_progress", trace: [], steps, accounting: spent(3, 0.008) };
}

function wholeFlow(): AutomationStudioFlowDraftStep[] {
  return [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })];
}

/** Another Flow each round, doing no more: a navigation step added (`run-muqiho7e-13be6c03`). */
const navigated = (n: number) => (request: AutomationStudioFlowBootstrapRoundRequest) =>
  finished([...request.repair!.seed.slice(0, 3), step(4, { id: `d${10 + n}`, actionId: "web.navigate", ranWith: { url: `https://shop.example/${n}` } })]);

type Said = { observed?: string; advice?: string; stillAchievable?: "yes" | "no" | "unknown" };
function no(findings: string[], said: Said = {}): AutomationStudioFlowBootstrapTestVerdict {
  return { verdict: "no", expected: "the towels in the cart", findings, ...said, spent: { ...NOTHING_SPENT, estimatedCostUsd: 0.001 } } as AutomationStudioFlowBootstrapTestVerdict;
}

function harness(rounds: Array<(request: AutomationStudioFlowBootstrapRoundRequest) => AutomationStudioLlmEvidenceLoopResult>, overrides: Partial<AutomationStudioFlowBootstrapBuildPhasesInput> = {}) {
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const kept: unknown[][] = [];
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
    keep: async (...args) => { kept.push(args); return { revision: 1, steps: (args[2] as unknown[]).length }; },
    now: () => 0,
    ...overrides
  };
  return { input, requests, kept };
}

async function unfinished(input: AutomationStudioFlowBootstrapBuildPhasesInput) {
  const outcome = await runAutomationStudioFlowBootstrapBuildPhases(input);
  if (outcome.kind !== "unfinished") throw new Error(`expected an unfinished build, got ${outcome.kind}`);
  return outcome;
}

describe("a round without measured progress, after a judge who named the fix", () => {
  it("is followed by one more round, and two in a row end the build unfinished, never not doable (run-murwcaj0-40e56557)", async () => {
    const verdicts = [
      no(["result.acts_judged_undone"], { observed: "no step reads the list after the confirms", advice: "add a read after the confirm loop", stillAchievable: "yes" }),
      no(["result.acts_judged_undone"], { observed: "the confirm acts on Tom Becker", advice: "confirm each row of the read", stillAchievable: "yes" }),
      no(["result.acts_judged_undone"], { observed: "the accepted read kept none", advice: "match the accepted text the list shows" })
    ];
    const { input, requests, kept } = harness([() => finished(wholeFlow()), navigated(1), navigated(2)], { judge: async () => verdicts.shift()! });

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(3);
    expect(outcome.ending).toMatchObject({ kind: "not_finished", tried: { rounds: 3, noRoute: { kind: "no_progress" } } });
    const message = outcome.ending.message;
    expect(message).not.toContain("found no way");
    expect(message).not.toContain("not doable");
    expect(message).toMatch(/^I have not finished this Flow yet\. My last 2 attempts to fix it each got no further than the one before/u);
    // The judge found something else this time: said as what it found, never "the same as before".
    expect(message).toContain("the judge's finding changed. What the judge found this time: the accepted read kept none.");
    expect(message).not.toContain("the judge found the same as before");
    expect(message).toContain("What the judge says is left to change: match the accepted text the list shows.");
    expect(message).toContain("The steps I found so far were kept as a draft, so building again carries on from them.");
    expect(outcome.kept).toEqual({ revision: 1, steps: 4 });
    expect(kept[0]![0]).toBe("judged_wrong");
    expect(parseAutomationStudioFlowBootstrapBuildEnding(outcome.ending, "flow_bootstrap.build_not_finished")).toEqual(outcome.ending);
  });

  it("says the judge found the same as before only when its finding codes and its advice are both unchanged", async () => {
    const same = { observed: "the test read no cart", advice: "press Add on the towels' own card" };
    const verdicts = [no(["result.no_records_stored"], same), no(["result.no_records_stored"], same), no(["result.no_records_stored"], { ...same, observed: "the test read no cart at all" })];
    const { input, requests } = harness([() => finished(wholeFlow()), navigated(1), navigated(2)], { judge: async () => verdicts.shift()! });

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(3);
    expect(outcome.ending.kind).toBe("not_finished");
    expect(outcome.ending.message).toContain("the judge found the same as before");
  });

  it("opens the one more round only if the purse funds it (t240's money rule)", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    /** DeepSeek flash's peak rates, every input token a miss: the price the harness hands the purse with each hold. */
    const flash = (inputTokens: number, outputTokens: number) => (inputTokens * 0.3 + outputTokens * 1.2) / 1_000_000;
    /** `count` decisions, each held and charged at `usd`, beside the judging pair the purse keeps back (t254). */
    const charge = (request: AutomationStudioFlowBootstrapRoundRequest, count: number, usd: number) => {
      for (let index = 0; index < count; index += 1) {
        const held = request.purse!.hold({ projectedCostUsd: usd, estimatedInputTokens: 10_000, maxOutputTokens: 750, price: flash });
        if (!held.ok) throw new Error("the purse refused a call the test expected it to pay for");
        held.hold.settle({ estimatedCostUsd: usd });
      }
    };
    const verdicts = [no(["result.no_records_stored"], { advice: "read the cart" }), no(["result.no_records_stored"], { advice: "read the cart" })];
    // $0.092 spent after round 1: $0.008 left, under what one more round needs (t254) -- the judging
    // pair at its unpriced allowance (2 x $0.0039) and the least a first decision is held at ($0.0009).
    const { input, requests } = harness([
      (request) => { charge(request, 1, 0.02); return finished(wholeFlow()); },
      (request) => { charge(request, 3, 0.024); return navigated(1)(request); }
    ], { purse, judge: async () => verdicts.shift()! });

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(2);
    expect(outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    expect(outcome.ending.message).toContain("which left $0.008, too little for another round: judging its Flow takes two judge calls");
  });
});

describe("a round without measured progress where the judge named no fix", () => {
  it("ends the build unfinished at once, with what stood still, never not doable", async () => {
    const { input, requests } = harness([() => finished(wholeFlow()), navigated(1)], { judge: async () => no(["result.no_records_stored"]) });

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(2);
    expect(outcome.ending).toMatchObject({ kind: "not_finished", tried: { rounds: 2, noRoute: { kind: "no_progress" } } });
    expect(outcome.ending.message).toMatch(/^I have not finished this Flow yet\. My last attempt to fix it got no further than the one before: no more of what you asked has a step than before, and the judge found the same as before\./u);
    expect(outcome.ending.message).not.toContain("found no way");
  });

  it("ends a round that handed back the Flow it started from on refused repeats unfinished too", async () => {
    const seeded = () => [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } })];
    const { input, requests } = harness([() => repeatsRefused(seeded())], { seedSignature: automationStudioFlowDraftReplaySignature(seeded()) });

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(1);
    expect(outcome.ending).toMatchObject({ kind: "not_finished", tried: { rounds: 1, noRoute: { kind: "repeated_unchanged" } } });
    expect(outcome.ending.message).toMatch(/^I have not finished this Flow yet\. My first attempt kept retrying the same things, which had already failed or done nothing, and left the Flow just as it started/u);
    expect(outcome.ending.message).not.toContain("found no way");
  });
});

describe("not doable", () => {
  it("is the ending only when the judge says what was asked can no longer be had", async () => {
    const { input, requests } = harness([() => finished(wholeFlow())], {
      judge: async () => no(["result.acts_judged_undone"], { observed: "the account has no friend requests left", stillAchievable: "no" })
    });

    const outcome = await unfinished(input);

    expect(requests).toHaveLength(1);
    expect(outcome.ending).toMatchObject({ kind: "not_doable", tried: { rounds: 1, noRoute: { kind: "judged_unachievable" } } });
    expect(outcome.ending.message).toMatch(/^I could not build this Flow, and I found no way to:/u);
    expect(outcome.ending.message).toContain("the judge found that what you asked can no longer be done");
    expect(parseAutomationStudioFlowBootstrapBuildEnding(outcome.ending, "flow_bootstrap.not_doable")).toEqual(outcome.ending);
  });
});
