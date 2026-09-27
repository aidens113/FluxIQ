// What the guidance in the draft entry costs, measured against the budgets it is
// actually given.
//
// The instruction grew from 491 characters to 1,047 in five commits, and nothing
// measured it. It is a fixed tax on a budget shared with the record of what the
// build ran, so each of those commits took room away from the steps -- and the
// last one took the entry past the point where it could be produced at all on a
// small budget, which showed up as a model amending a Flow it had never been
// shown (`t157`). The prose was right every time; nobody could see the bill.
//
// So the bill is a test. Each case below is a real budget the entry is given, and
// asserts the consequence at that budget rather than a margin for its own sake:
// what a live build is shown, what `./accrual.test.ts` is shown, and whether the
// floor a draft budget must clear is still true. Lengthening the guidance is
// allowed -- it is how the last few tasks' builds work -- but it is a decision
// with a price, and a failure here is the price. Read what broke, then choose:
// shorten the prose, raise the context budget, or accept the trade and re-measure
// these numbers.

import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry } from "../entry.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES } from "../../llm/index.ts";

/**
 * The live draft budget: a quarter of a build's evidence context, capped at
 * 4,000 (`../../llm/loop-configuration.ts`), from the 24,000-byte context in
 * `../../loop-limits/`. `../../llm/tests/evidence-loop-draft-shown.test.ts`
 * pins the arithmetic that produces it, so this is one number in two places
 * rather than two numbers.
 */
const LIVE_BYTES = 4_000;
/** What a context of 6,000 gives the draft, which is what `./accrual.test.ts` runs on. */
const ACCRUAL_BYTES = 1_500;

function step(position: number, actionId: string, input: Record<string, string>): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept" };
}

/** A build's worth of real steps: a handle and a value each, as a web build's are. */
const built = (count: number) => Array.from({ length: count }, (_, index) =>
  step(index + 1, index % 3 === 0 ? "press" : index % 3 === 1 ? "enter" : "go", { target: `handle.${index}.control`, value: "wireless earbuds" }));

type Entry = {
  format?: string;
  steps: ({ step: number; input?: unknown } | unknown[])[];
  unlisted?: number;
  instruction: string;
};

function entry(steps: readonly AutomationStudioFlowDraftStep[], maxBytes: number) {
  const value = automationStudioFlowDraftEntry({ steps, maxBytes })!.value as Entry;
  return {
    value,
    bytes: Buffer.byteLength(JSON.stringify(value), "utf8"),
    withInput: value.format === "step_rows_v1"
      ? (value.steps as unknown[][]).filter((line) => line[2] !== null).length
      : (value.steps as { input?: unknown }[]).filter((line) => line.input).length
  };
}

/** The longest telling, which is what the entry uses whenever it fits. */
const FULL_INSTRUCTION = (automationStudioFlowDraftEntry({ steps: built(1), maxBytes: 100_000 })!.value as Entry).instruction;

describe("what the draft's guidance costs", () => {
  // The direct statement of the growth. 491 characters at `6bb47f8`, 678 at
  // `0607038`, 1,047 at `b2fab59` -- which is the commit that made the entry
  // impossible on any budget under 1,109 bytes. Every character here is paid for
  // by every entry of every build, on the same bytes as the record of what the
  // build ran.
  it("is a thousand characters, and every character is paid on every call", () => {
    expect(FULL_INSTRUCTION.length).toBeLessThanOrEqual(1_100);
    expect(FULL_INSTRUCTION.length).toBeGreaterThan(400);
  });

  // A build the length of `run-muhubegx-9469de5e`'s draft. Twelve steps with
  // their arguments and the guidance in full cost 2,877 of the live 4,000, so
  // there is room for roughly 1,100 more characters of guidance before a
  // twelve-step build starts being shown steps without the argument they ran
  // with -- and an argument is what an amendment corrects.
  it("leaves a live build's whole draft in front of the model", () => {
    const measured = entry(built(12), LIVE_BYTES);
    expect(measured.value.instruction).toBe(FULL_INSTRUCTION);
    expect(measured.value.steps).toHaveLength(12);
    expect(measured.value.unlisted).toBeUndefined();
    expect(measured.withInput).toBe(12);
    expect(LIVE_BYTES - measured.bytes).toBeGreaterThanOrEqual(1_000);
  });

  // A long build crossed 4,000 only because every row repeated the same field
  // names. The packed representation pays those names once and keeps every
  // bounded argument instead of trading away model-visible draft state.
  it("keeps every step and bounded argument of a long build", () => {
    const measured = entry(built(20), LIVE_BYTES);
    expect(measured.value.steps).toHaveLength(20);
    expect(measured.value.unlisted).toBeUndefined();
    expect(measured.value.instruction).toBe(FULL_INSTRUCTION);
    expect(measured.value.format).toBe("step_rows_v1");
    expect(measured.withInput).toBe(20);
    expect(measured.bytes).toBeLessThanOrEqual(LIVE_BYTES);
  });

  // `./accrual.test.ts` asserts that all three of its presses are shown with the
  // argument they ran with, on a 6,000-byte context. That entry costs 1,447 of
  // 1,500: 53 bytes of margin, which is the tightest of the budgets here. Fifty
  // more characters of guidance and that test fails -- the arguments go first,
  // and it is asserting the arguments.
  it("still fits the budget a smaller context gives it, arguments and all", () => {
    const steps = Array.from({ length: 3 }, (_, index) => step(index + 1, "press", { target: `target.${index + 1}` }));
    const measured = entry(steps, ACCRUAL_BYTES);
    expect(measured.value.instruction).toBe(FULL_INSTRUCTION);
    expect(measured.withInput).toBe(3);
    expect(measured.bytes).toBeLessThanOrEqual(ACCRUAL_BYTES);
  });

  // The floor a draft budget must clear is a claim about this entry: that at
  // 1,280 bytes it can still list one step with its argument and say in full how
  // to correct it. Today that costs 1,256. If the guidance grows past the floor,
  // the floor is a lie -- a budget at it would be accepted by `resolveLimits` and
  // still be told short -- so the two move together or not at all.
  it("makes the floor under a draft budget true", () => {
    const measured = entry(built(1), AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES);
    expect(measured.value.instruction).toBe(FULL_INSTRUCTION);
    expect(measured.withInput).toBe(1);
    expect(measured.bytes).toBeLessThanOrEqual(AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES);
  });
});
