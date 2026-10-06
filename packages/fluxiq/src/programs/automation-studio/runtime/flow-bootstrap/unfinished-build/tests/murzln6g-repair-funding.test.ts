// Live run murzln6g (2026-10-03, t254): its Flow was judged no with $0.0111 of
// its $0.10 left, and the round gate refused a repair needing $0.0187 -- the
// last exploration decision's hold ($0.0144: its packed request, about 12,800
// tokens more than it sent, and a 2,000-token reply cap) plus one judge call's
// ($0.0043, with a 2,000-token cap). Under t254 the gate counts the judging pair
// held at what the judge's calls actually send, with a 1,250-token reply reserve
// and no cap, and only the least of a first decision; the first decision is then
// priced from its own request, beside the judging pair the purse keeps back.
//
// The figures are the run's, from `reports/t254-purse-hold-investigation.md` in
// the extension repository: the last decision sent 27,119 tokens by bytes/3
// (22,452 billed), each judge call 6,409 (4,742 billed) and cost $0.00193 and
// $0.00084, and a repair's first request is about 0.74 times the last
// decision's (20,068 tokens). Every call is held through the real harness hold
// at DeepSeek flash's rates for the clock it is made on.
//
// At peak rates the repair's first decision does not fit beside the judging
// kept back. Since t254 stage 2 that reserve is spent judging the Flow as it
// stands (`../reserve-judging.ts`) -- but here the repair was refused its first
// decision, so its Flow is still the seed round 0's judge said no to. Since
// stage 3 such a Flow is not tested or judged again: the build ends at cost with
// round 0's findings, the reserve unspent (`../phases.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import {
  AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES,
  AutomationStudioLlmBuildPurse,
  automationStudioLlmBuildPurseHoldCall,
  automationStudioLlmBuildPurseRun,
  automationStudioLlmBuildPurseScope
} from "../../../llm/build-purse/index.ts";
import { estimateAutomationStudioDeepSeekCostUsd } from "../../../llm/deepseek/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopResult } from "../../../llm/index.ts";
import { automationStudioInstructedActsChecklist } from "../../instructed-acts/index.ts";
import { runAutomationStudioFlowBootstrapBuildPhases, type AutomationStudioFlowBootstrapRoundRequest, type AutomationStudioFlowBootstrapTestVerdict } from "../index.ts";

const INSTRUCTION = "Add two packs of the Softly Paper Towels to my cart, then save the Brightline kettle to my saved items.";
/** Wednesday 2026-09-30 02:00 UTC: a peak hour. */
const PEAK = Date.UTC(2026, 8, 30, 2);
/** Saturday 2026-10-03 05:00 UTC: off-peak, when murzln6g ran. */
const OFF_PEAK = Date.UTC(2026, 9, 3, 5);
const LAST_DECISION_SENT = 27_119;
const PACKED_OVERHEAD = 12_800;
const JUDGE_SENT = 6_409;
const FIRST_REPAIR_SENT = 20_068;
const DECISION_REPLY = AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.decisionReplyTokens;
const JUDGE_REPLY = AUTOMATION_STUDIO_LLM_BUILD_CALL_RESERVES.judgeReplyTokens;
/** The exploration's last decision and the judge pair cost $0.00777; earlier builds of the Flow and the rest of the exploration $0.08113: $0.0889 in all. */
const SPENT_BEFORE = 0.08113;
const NOTHING = { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

const flashAt = (atMs: number) => (inputTokens: number, outputTokens: number) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, "deepseek-flash", atMs);

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }, ...overrides
  };
}
const wholeFlow = () => [step(1, { acts: ["a1"] }), step(2, { acts: ["a1.quantity"], input: { quantity: "2" } }), step(3, { acts: ["a2"] })];
const accounting = (iterations: number, estimatedCostUsd: number): AutomationStudioLlmEvidenceLoopAccounting => ({ iterations, toolCalls: iterations, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd });

/** What the judge says of the repair round's Flow when it is judged no: with nothing more to be had, by its word. */
const REPAIR_JUDGED_NO: AutomationStudioFlowBootstrapTestVerdict = { verdict: "no", expected: "the kettle saved", observed: "the saved items list was empty", advice: "save the kettle from its product page", findings: ["result.required_values_missing"], stillAchievable: "no", spent: { ...NOTHING, estimatedCostUsd: 0.00277 } };

/** murzln6g's build: one exploration round ending on its last decision, judged no by a pair of judge calls, then whatever repair the purse will fund. */
async function murzln6g(atMs: number, repairVerdict: "yes" | "no" = "yes") {
  const price = flashAt(atMs);
  const provider = { estimateCostUsd: ({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) => price(inputTokens, outputTokens) };
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1, carriedUsd: SPENT_BEFORE });
  const requests: AutomationStudioFlowBootstrapRoundRequest[] = [];
  const firstRepairHolds: Array<{ ok: boolean }> = [];
  const judgeHolds: Array<{ round: number; ok: boolean }> = [];
  const tests: Array<{ steps: number; judged: boolean }> = [];
  const announced: string[] = [];
  let refusal: AutomationStudioLlmBuildPurse["refusal"];
  /** One call through the harness's own hold, charged `costUsd` when it was sent. */
  const call = (estimatedInputTokens: number, maxOutputTokens: number, costUsd: number, judge = false) => {
    const held = automationStudioLlmBuildPurseHoldCall({ provider, estimatedInputTokens, maxOutputTokens, judge });
    if (held?.ok) held.hold.settle({ estimatedCostUsd: costUsd });
    return { ok: held?.ok === true };
  };
  const outcome = await automationStudioLlmBuildPurseScope(purse, () => runAutomationStudioFlowBootstrapBuildPhases({
    round: async (request): Promise<AutomationStudioLlmEvidenceLoopResult> => {
      requests.push(request);
      if (request.round === 0) {
        await automationStudioLlmBuildPurseRun(purse, async () => { if (!call(LAST_DECISION_SENT, DECISION_REPLY, 0.005).ok) throw new Error("the exploration's last decision was refused"); });
        return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps: wholeFlow(), accounting: accounting(1, 0.005) };
      }
      // The repair's first decision, priced from its own request.
      const first = call(FIRST_REPAIR_SENT, DECISION_REPLY, 0.0025);
      firstRepairHolds.push(first);
      if (!first.ok) {
        if (purse.refusal?.code !== "llm_budget.run_cost_limit") throw new Error("Expected a cost-only refusal");
        refusal = purse.refusal && { ...purse.refusal };
        return {
          ok: false, code: "llm_evidence_loop.iteration_limit", trace: [], steps: request.repair!.seed, accounting: accounting(0, 0),
          exhaustion: { bound: "budget", budgetBound: "cost", ...(purse.refusal ? { costRefusal: { ...purse.refusal } } : {}), maxIterations: 64, iterations: 0, draftSteps: 3, proposableSteps: 3, completionAttempts: 0, lastIssueCodes: [], outstandingIssueCodes: [] }
        };
      }
      return { ok: true, result: { summary: "Adds and saves." }, trace: [], steps: [...request.repair!.seed.slice(0, 2), step(3, { id: "d9", acts: ["a2"], ranWith: { target: "kettle" } })], accounting: accounting(1, 0.0025) };
    },
    judge: async ({ round, loop }): Promise<AutomationStudioFlowBootstrapTestVerdict> => {
      // The judge's two calls: a first answer, then a second confirming or asking again.
      judgeHolds.push({ round, ...call(JUDGE_SENT, JUDGE_REPLY, 0.00193, true) });
      judgeHolds.push({ round, ...call(JUDGE_SENT, JUDGE_REPLY, 0.00084, true) });
      const spent = { ...NOTHING, estimatedCostUsd: 0.00277 };
      if (round === 0) return { verdict: "no", expected: "250 Count in the cart", observed: "the 100 Count was added", findings: ["result.required_values_missing"], spent };
      return repairVerdict === "yes" ? { verdict: "yes", spent, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) } : { ...REPAIR_JUDGED_NO, flowSignature: automationStudioFlowDraftFlowSignature(loop.steps) };
    },
    test: async (steps, options) => {
      tests.push({ steps: steps.length, judged: options?.judged === true });
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
  }));
  return { outcome, purse, requests, firstRepairHolds, judgeHolds, tests, announced, refusal, price };
}

describe("run murzln6g: a repair round after a judged no with $0.0111 left (t254)", () => {
  it.each(["yes", "no"] as const)("needed $0.0187 by the old gate, opens a repair round now, and at peak rates ends at cost with round 0's findings when the refused first decision leaves round 0's Flow unchanged (a repair judge that would say %s is not asked)", async (repairVerdict) => {
    const peak = flashAt(PEAK);
    // The old gate: the last decision held at its packed request and a 2,000-token cap, plus one judge call with a 2,000-token cap.
    const oldGate = peak(LAST_DECISION_SENT + PACKED_OVERHEAD, 2_000) + peak(JUDGE_SENT, 2_000);
    expect(oldGate).toBeCloseTo(0.0187, 4);
    expect(oldGate).toBeGreaterThan(0.0111);
    // The gate now: the judging pair at what a judge call sends with its 1,250-token reserve, and a first decision's least.
    const gate = 2 * peak(JUDGE_SENT, JUDGE_REPLY) + peak(0, DECISION_REPLY);
    expect(gate).toBeCloseTo(0.007745, 6);

    const { outcome, purse, requests, firstRepairHolds, judgeHolds, tests, announced, refusal } = await murzln6g(PEAK, repairVerdict);

    // Judged no with $0.0111 left, as the run was.
    expect(requests).toHaveLength(2);
    expect(requests[1]!.repair).toBeDefined();
    // The repair's first decision is priced from its own 20,068 tokens ($0.0069), and does not fit beside the
    // judging pair kept back ($0.0068): at peak rates $0.0111 buys a repair round's judging, not its first decision.
    expect(firstRepairHolds).toEqual([{ ok: false }]);
    expect(refusal).toMatchObject({ spentUsd: expect.closeTo(0.0889, 9), pendingUsd: 0, keptBackUsd: expect.closeTo(2 * peak(JUDGE_SENT, JUDGE_REPLY), 9), projectedCostUsd: expect.closeTo(peak(FIRST_REPAIR_SENT, DECISION_REPLY), 9) });
    // The Flow the repair left is the seed round 0's judge said no to: no test and no judge call (t254 stage 3).
    expect(tests).toEqual([]);
    expect(judgeHolds).toEqual([{ round: 0, ok: true }, { round: 0, ok: true }]);
    expect(announced).toContain("The build reached its spending limit before the Flow was finished. The Flow is unchanged since the judge said it does not do what was asked, so what was kept back for judging is not spent judging it again.");
    expect(announced.some((text) => text.includes("judging it with what was kept back"))).toBe(false);
    // Ended at cost with round 0's findings and the Flow kept as a draft; never "not doable".
    expect(outcome.kind === "unfinished" && outcome.ending).toMatchObject({ kind: "budget_exhausted", bound: "cost" });
    const message = outcome.kind === "unfinished" ? outcome.ending.message : "";
    expect(message).toContain("its next call could have cost up to $0.007, more than was left beside the $0.007 kept back for judging the Flow, and that was not spent, because the Flow was unchanged since the judge said it does not do what was asked, and it had spent $0.089 ($0.081 of it by earlier builds of this Flow) in all.");
    expect(message).toContain("The judge found: the 100 Count was added.");
    expect(message).toContain("The steps I found so far were kept as a draft, so building again carries on from them, with $0.011 left of this Flow's $0.10.");
    expect(message).not.toContain("went on testing and judging");
    expect(message).not.toContain("saved items list");
    // Only round 0's decision and judging were spent; the reserve was left.
    expect(outcome.kind === "unfinished" && outcome.accounting.estimatedCostUsd).toBeCloseTo(0.005 + 0.00277, 9);
    expect(purse.spentUsd()).toBeCloseTo(0.0889, 9);
    expect(purse.breaches).toBe(0);
  });

  it("repairs and finishes at the off-peak rate the run was billed at, its holds half the peak figures", async () => {
    const offPeak = flashAt(OFF_PEAK);
    expect(offPeak(FIRST_REPAIR_SENT, DECISION_REPLY)).toBeCloseTo(flashAt(PEAK)(FIRST_REPAIR_SENT, DECISION_REPLY) / 2, 12);

    const { outcome, firstRepairHolds } = await murzln6g(OFF_PEAK);

    // Off-peak, the first repair decision ($0.0035) fits beside the judging pair ($0.0034) in $0.0111, and the repair is judged yes.
    expect(firstRepairHolds).toEqual([{ ok: true }]);
    expect(outcome).toMatchObject({ kind: "finished", rounds: 2 });
  });
});
