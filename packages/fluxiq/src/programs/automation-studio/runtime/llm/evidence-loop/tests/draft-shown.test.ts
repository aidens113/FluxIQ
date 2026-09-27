// The measurement of a draft entry, taken from entries the draft actually
// produced.
//
// Every case here builds its entry with `automationStudioFlowDraftEntry` rather
// than by hand, because that is the only thing holding the measurement to the
// entry: the entry is written for a model, its field names are nobody's
// contract, and a rename there would quietly turn every count below into a zero.
// A hand-written fixture would keep passing while the loop's record went blank.

import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceLoopDraftShown } from "../draft-shown.ts";

const FLOOR = 1_280;

function step(position: number, input: Record<string, string>): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId: "press", input, effect: "mutate", effectApplied: true, disposition: "kept" };
}

const steps = (count: number, note = "") => Array.from({ length: count }, (_, index) =>
  step(index + 1, { target: `target.${index}`, ...(note ? { note } : {}) }));

/** The entry the draft produces at `budget`, measured as the loop measures it. */
function shown(draft: readonly AutomationStudioFlowDraftStep[], budget: number) {
  const entry = automationStudioFlowDraftEntry({ steps: draft, maxBytes: budget });
  return automationStudioLlmEvidenceLoopDraftShown({ value: entry!.value, budget, minBytes: FLOOR });
}

const PACKED_FIELDS = [
  "step", "actionId", "input", "resultCode", "changed",
  "disposition", "inResult", "replayed", "runs", "settings"
];

describe("what the model was shown of its draft", () => {
  it("is the entry's own size, and says nothing was left out when nothing was", () => {
    const entry = automationStudioFlowDraftEntry({ steps: steps(3), maxBytes: 4_000 })!;
    const measured = automationStudioLlmEvidenceLoopDraftShown({ value: entry.value, budget: 4_000, minBytes: FLOOR });
    expect(measured.bytes).toBe(Buffer.byteLength(JSON.stringify(entry.value), "utf8"));
    expect(measured.steps).toBe(3);
    // The full telling, which is what a build on the live budget is given.
    expect(measured.instructionBytes).toBeGreaterThan(1_000);
    expect(measured).not.toHaveProperty("unlisted");
    expect(measured).not.toHaveProperty("withoutInput");
    expect(measured).not.toHaveProperty("inputTooLarge");
    expect(measured).not.toHaveProperty("overBudget");
    expect(measured).not.toHaveProperty("budgetBelowFloor");
  });

  it("counts the arguments and the steps the entry gave up to fit, and how short the telling went", () => {
    const measured = shown(steps(12, "x".repeat(40)), 900);
    expect(measured.budget).toBe(900);
    expect(measured.bytes).toBeLessThanOrEqual(900);
    // Whatever the ladder chose, the record adds up: every step is either listed
    // or counted, and an argument the entry could not carry is counted too.
    expect(measured.steps + (measured.unlisted ?? 0)).toBe(12);
    expect(measured.withoutInput ?? 0).toBe(measured.steps);
    expect(measured.instructionBytes).toBeLessThan(200);
    expect(measured.budgetBelowFloor).toBe(true);
  });

  it("holds an argument too large to show apart from one dropped to make room", () => {
    const large = [step(1, { value: "y".repeat(900) }), step(2, { target: "target.2" })];
    const measured = shown(large, 4_000);
    expect(measured.steps).toBe(2);
    // The first step's argument was there and could not be carried; the second's
    // was carried. Neither is a step that ran without an argument.
    expect(measured.inputTooLarge).toBe(1);
    expect(measured).not.toHaveProperty("withoutInput");
  });

  it("measures every input in an exact self-describing packed entry", () => {
    const draft = steps(12, "x".repeat(40));
    const ordinary = automationStudioFlowDraftEntry({ steps: draft, maxBytes: 100_000 })!.value;
    const budget = Buffer.byteLength(JSON.stringify(ordinary), "utf8") - 1;
    const entry = automationStudioFlowDraftEntry({ steps: draft, maxBytes: budget })!;
    expect(entry.value).toMatchObject({ format: "step_rows_v1", fields: PACKED_FIELDS });

    const measured = automationStudioLlmEvidenceLoopDraftShown({ value: entry.value, budget, minBytes: FLOOR });
    expect(measured.steps).toBe(12);
    expect(measured).not.toHaveProperty("withoutInput");
    expect(measured).not.toHaveProperty("inputTooLarge");
  });

  it("counts null packed input cells as inputs withheld to fit", () => {
    const draft = steps(12, "x".repeat(40));
    const entries = Array.from({ length: 1_600 }, (_, offset) => {
      const budget = 2_400 - offset;
      return { budget, entry: automationStudioFlowDraftEntry({ steps: draft, maxBytes: budget })! };
    });
    const candidate = entries.find(({ entry }) => {
      const value = entry.value as { format?: string; unlisted?: number; steps?: unknown[][] };
      return value.format === "step_rows_v1"
        && value.unlisted === undefined
        && value.steps?.some((line) => line[2] === null);
    });
    expect(candidate).toBeDefined();
    const value = candidate!.entry.value as { steps: unknown[][] };
    const withheld = value.steps.filter((line) => line[2] === null).length;
    const measured = automationStudioLlmEvidenceLoopDraftShown({
      value: candidate!.entry.value,
      budget: candidate!.budget,
      minBytes: FLOOR
    });
    expect(measured.steps).toBe(12);
    expect(measured.withoutInput).toBe(withheld);
    expect(measured).not.toHaveProperty("inputTooLarge");
  });

  it.each([
    ["an unknown format", { format: "step_rows_v2", fields: PACKED_FIELDS, steps: [] }],
    ["missing format metadata", { fields: PACKED_FIELDS, steps: [[1, "press", {}, null, "yes", "kept", true]] }],
    ["reordered fields", { format: "step_rows_v1", fields: [...PACKED_FIELDS].reverse(), steps: [] }],
    ["object lines", { format: "step_rows_v1", fields: PACKED_FIELDS, steps: [{ step: 1, input: {} }] }],
    ["a short row", { format: "step_rows_v1", fields: PACKED_FIELDS, steps: [[1, "press", {}, null, "yes", "kept"]] }],
    ["an invalid input cell", { format: "step_rows_v1", fields: PACKED_FIELDS, steps: [[1, "press", "hidden", null, "yes", "kept", true]] }],
    ["an extra column", { format: "step_rows_v1", fields: PACKED_FIELDS, steps: [[1, "press", {}, null, "yes", "kept", true, null, null, null, "extra"]] }]
  ])("fails closed on %s instead of reporting zero omissions", (_label, packed) => {
    expect(() => automationStudioLlmEvidenceLoopDraftShown({
      value: { code: "llm_evidence_loop.draft", instruction: "draft", ...packed },
      budget: 4_000,
      minBytes: FLOOR
    })).toThrow("Cannot measure malformed or unknown packed draft shape");
  });

  it("says the entry went over its budget rather than pretending it fitted", () => {
    const measured = shown(steps(12), 200);
    expect(measured.steps).toBe(1);
    expect(measured.unlisted).toBe(11);
    expect(measured.bytes).toBeGreaterThan(200);
    expect(measured.overBudget).toBe(true);
    expect(measured.budgetBelowFloor).toBe(true);
  });

  it("says a budget under the floor is under it, whatever this particular entry cost", () => {
    // One step fits a budget of 1,000 with room to spare, so nothing about this
    // entry looks wrong -- and it is still not being told in full, which is what
    // the floor is the floor of and what is worth recording about the build.
    const measured = shown(steps(1), 1_000);
    expect(measured.overBudget).toBeUndefined();
    expect(measured.budgetBelowFloor).toBe(true);
    expect(measured.instructionBytes).toBeLessThan(1_000);
    // At the floor the same one step is told in full, which is what the floor
    // means: 1,221 bytes for a bare step, 1,256 with a realistic argument.
    const atFloor = shown(steps(1), FLOOR);
    expect(atFloor.budgetBelowFloor).toBeUndefined();
    expect(atFloor.instructionBytes).toBeGreaterThan(1_000);
  });
});
