// What the record says about the draft the model was shown, and what a budget
// too small to show one properly does about it.
//
// The defect these exist for had no symptom. A draft budget beneath the entry's
// own floor made the entry impossible, the entry answered with `undefined`, and
// the loop's `[draftEntry, budgetEntry].filter(...)` dropped the `undefined`
// without a word: the model was asked to decide, and to amend, with no record
// anywhere of what it had been shown. Settling whether a live run had been
// affected meant rebuilding twelve steps by hand out of the rest of the trace.
//
// So two things are held here. The row says what the decision saw and what
// showing it cost, and a budget that cannot show a draft properly is either
// refused outright or named on every row -- never absorbed.

import { describe, expect, it, vi } from "vitest";
// This directory's barrel first, and deliberately: `runtime/loop-limits/`
// imports back into it, so reached before it this file evaluates
// `deepseek/system-prompt.ts` while the module it reads a function out of is
// still evaluating, and the suite fails to collect at all. It is the cycle
// `scripts/structure-audit/config.mjs` describes, and importing the barrel first
// is what `../../loop-limits/tests/` already does about it.
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES, runAutomationStudioLlmEvidenceLoop } from "../index.ts";
import { resolveLimits } from "../loop-configuration.ts";
import { AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES, automationStudioFlowBootstrapEvidenceLoopLimits } from "../../loop-limits/index.ts";

const tools = [
  { toolId: "inspect", description: "Look at the target.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const }
];
const pressed = (index: number, value = "") => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}`, ...(value ? { value } : {}) } });
const complete = { kind: "complete", result: { flow: "..." } };
const pressing = async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "after" }, effectApplied: true });

/** A run of `presses` presses and then a completion, on the given context budget. */
async function run(presses: number, over: Record<string, unknown> = {}) {
  const decide = vi.fn();
  for (let index = 1; index <= presses; index += 1) decide.mockResolvedValueOnce(pressed(index));
  decide.mockResolvedValue(complete);
  return runAutomationStudioLlmEvidenceLoop({ tools, decide, maxIterations: 12, maxToolCalls: 12, executeTool: pressing, ...over });
}

describe("what the record says about the draft the model was shown", () => {
  it("says the entry's size, its budget, and how much guidance it carried, on every row of the decision that saw it", async () => {
    const result = await run(3);
    expect(result.ok).toBe(true);
    // The first decision is made before anything has been run, so it is shown no
    // draft -- which is the one thing absence may now mean.
    expect(result.trace.map((row) => row.draft?.steps)).toEqual([undefined, 1, 2, 3]);
    const third = result.trace[3]?.draft;
    expect(third).toMatchObject({ steps: 3, budget: 4_000 });
    // The whole draft, told in full: no step unlisted, no argument held back.
    expect(third?.unlisted).toBeUndefined();
    expect(third?.withoutInput).toBeUndefined();
    expect(third?.overBudget).toBeUndefined();
    expect(third?.budgetBelowFloor).toBeUndefined();
    expect(third?.instructionBytes).toBeGreaterThan(1_000);
    expect(third!.bytes).toBeLessThanOrEqual(third!.budget);
    // The size is the entry's own, not an estimate: it grows with the record.
    expect(third!.bytes).toBeGreaterThan(result.trace[1]!.draft!.bytes);
  });

  it("says what shrinking the draft cost, so nothing is missing without the record saying so", async () => {
    // A context of 2,048 derives a draft budget of 512: under the floor, so the
    // guidance is told in its shortest words and the oldest steps are counted
    // rather than listed.
    const result = await run(4, { maxEvidenceContextBytes: 2_048 });
    expect(result.ok).toBe(true);
    const last = result.trace.at(-1)?.draft;
    expect(last?.budget).toBe(512);
    expect(last?.budgetBelowFloor).toBe(true);
    // The two sentences the model cannot act without, in place of the full
    // telling this build would have been given at the live budget.
    expect(last?.instructionBytes).toBeLessThan(200);
    expect(last!.steps + (last?.unlisted ?? 0)).toBe(4);
    expect(last?.unlisted).toBeGreaterThan(0);
    expect(last?.withoutInput).toBeGreaterThan(0);
  });

  it("says when the entry went over its budget rather than letting the draft disappear", async () => {
    // 1,024 is the smallest context the resolver admits, and a quarter of it is
    // 256 -- less than the least entry costs. The entry goes out over budget,
    // because a model shown no draft does not know it has one, and the row says
    // both that it did and that the budget was never enough.
    const result = await run(2, { maxEvidenceContextBytes: 1_024 });
    const last = result.trace.at(-1)?.draft;
    expect(last?.budget).toBe(256);
    expect(last?.overBudget).toBe(true);
    expect(last?.budgetBelowFloor).toBe(true);
    expect(last?.steps).toBe(1);
    expect(last!.bytes).toBeGreaterThan(256);
  });

  // `run-mune0xh1-2470406a` ended its build with a bare `thrown.Error` the moment
  // its draft outgrew the full entry while it held a refused press: the packed
  // entry shows that step as `did_not_work`, and measuring the entry refused it
  // (`../evidence-loop/draft-shown.ts`). Runs 6 and 7 of the live lane ended the same way.
  it("goes on deciding once a draft holding a refused press has to be packed", async () => {
    let call = 0;
    const sometimesRefused = async () => {
      call += 1;
      return call % 3 === 0
        ? { kind: "llm_evidence_tool_execution", evidence: { page: "unchanged", refused: `press ${call}` }, effectApplied: false }
        : { kind: "llm_evidence_tool_execution", evidence: { page: `after ${call}` }, effectApplied: true };
    };
    const decide = vi.fn();
    for (let index = 1; index <= 10; index += 1) decide.mockResolvedValueOnce(pressed(index, "v".repeat(240)));
    decide.mockResolvedValue(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, maxIterations: 12, maxToolCalls: 12, executeTool: sometimesRefused });

    expect(result.ok).toBe(true);
    const last = result.trace.at(-1)?.draft;
    expect(last?.steps).toBe(10);
    expect(last?.overBudget).toBeUndefined();
    // Packed, which is the only shape the refusal could happen in. Read by the
    // draft's own format, since the decision history beside it packs too.
    const lastShown = (decide.mock.calls.at(-1)![0] as { evidence: { value: { format?: string } }[] }).evidence;
    expect(lastShown.some((entry) => entry.value?.format === "step_rows_v1")).toBe(true);
  });

  it("carries no draft for a loop that is not drafting at all", async () => {
    const result = await run(2, { draft: false });
    expect(result.ok).toBe(true);
    expect(result.trace.every((row) => row.draft === undefined)).toBe(true);
  });
});

describe("a draft budget too small to show a draft properly", () => {
  // A caller that names the number itself is refused: there is nothing to derive
  // and nothing to trade off, and a build whose amendments are guesses is worse
  // than a build that does not start. This is the mistake t157 left open --
  // `resolveLimits` would take any `draftBytes` from 0 up.
  it("is refused when the caller named it", async () => {
    await expect(run(1, { draft: { maxBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES - 1 } }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
    await expect(run(1, { draft: { maxBytes: 900 } }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.invalid_configuration" });
    await expect(run(1, { draft: { maxBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES } }))
      .resolves.toMatchObject({ ok: true });
  });

  // A budget derived from a small context is not refused. Refusing a run
  // outright over a tunable is its own harm, and the context is a legal setting
  // from 1,024 up; what the run owes is a record of the degradation, which the
  // rows above carry.
  it("is not refused when the loop derived it, and is named on the rows instead", async () => {
    const result = await run(2, { maxEvidenceContextBytes: 2_048 });
    expect(result.ok).toBe(true);
    expect(result.trace.some((row) => row.draft?.budgetBelowFloor)).toBe(true);
  });

  it("is not what the live build profile resolves to", () => {
    const decide = async () => complete;
    const executeTool = pressing;
    const live = automationStudioFlowBootstrapEvidenceLoopLimits({});
    expect(live.loop.maxEvidenceContextBytes).toBe(AUTOMATION_STUDIO_EVIDENCE_CONTEXT_BYTES);
    // The ratchet under the live number: the draft's share of a build's context
    // is a quarter of it, capped at 4,000, so lowering the context below 5,120
    // would put every live build's draft under the floor -- silently, before
    // this assertion existed.
    const limits = resolveLimits({ tools, decide, executeTool, ...live.loop });
    expect(limits?.draftBytes).toBe(4_000);
    expect(limits!.draftBytes).toBeGreaterThanOrEqual(AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES);
    // And the budget `../../flow-draft/tests/accrual.test.ts` runs on, which
    // `entry-budget.test.ts` measures the entry against.
    expect(resolveLimits({ tools, decide, executeTool, maxEvidenceContextBytes: 6_000 })?.draftBytes).toBe(1_500);
  });
});
