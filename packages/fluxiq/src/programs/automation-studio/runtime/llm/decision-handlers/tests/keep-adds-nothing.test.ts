// A decision whose every amendment is a `keep` of a step already in the Flow
// adds nothing, and the model is told so (`../amendment.ts`, `keepOnly`).
//
// Live run `run-muwaq9w3-baaa4e19` (lane B, round 2), decisions 0027-0036:
// five amendment decisions of `keep` on steps already in the Flow, each
// refused `act_already_named` or `already_in_flow`, while the model's
// summaries said it was "adding the paper towel quantity" steps. Each answer
// listed the refusals and what was still owed, and none said that `keep`
// cannot add a step or do an act.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const press = { toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const check = (decide: { mock: { calls: unknown[][] } }, index: number): JsonObject | undefined => shownAt(decide, index).find((entry) => entry.toolId === "core.amendment_check")?.value;

/** Every press moves the page on and works, as the store picker and the size choice did. */
function site() {
  let page = 0;
  return vi.fn(async () => {
    const before = `s${page}`;
    page += 1;
    return { kind: "llm_evidence_tool_execution", stateDigests: { before, after: `s${page}` }, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.click", effect: "mutate", proposes: true } };
  });
}

const built = [
  { kind: "tool_call", callId: "store", toolId: "press", input: { target: "Set as my store" }, add: true },
  { kind: "tool_call", callId: "size", toolId: "press", input: { target: "12 Double Rolls" }, add: true }
];
const complete = { kind: "complete", result: { done: true } };

const loop = (decide: ReturnType<typeof vi.fn>) => runAutomationStudioLlmEvidenceLoop({
  tools: [press], decide, executeTool: site(), maxIterations: 20, maxToolCalls: 20, dryRun: false
});

/** Two pressed steps in the Flow, then `amendments`, then complete. */
function decisions(amendments: JsonObject[]) {
  const decide = vi.fn();
  for (const decision of built) decide.mockResolvedValueOnce(decision);
  return decide.mockResolvedValueOnce({ kind: "amend_draft", amendments }).mockResolvedValue(complete);
}

describe("keep on steps already in the Flow", () => {
  it("is told that keep adds nothing and how an owed act is done, before the refusals, and counts as no progress", async () => {
    const decide = decisions([{ step: 2, change: "keep" }, { step: 1, change: "keep" }]);

    await loop(decide);

    const told = check(decide, 3);
    expect(told).toMatchObject({ ok: false, keepAddsNothing: true, applied: 0, refused: [{ step: 2, reason: "already_in_flow" }, { step: 1, reason: "already_in_flow" }], stepsWithoutProgress: 1 });
    const instruction = String(told?.instruction);
    expect(instruction.startsWith("keep adds nothing")).toBe(true);
    expect(instruction).toContain("A step joins the Flow only by running it");
    expect(instruction).toContain("with add and act naming it");
    // What the draft's own answer says follows it unchanged.
    expect(instruction).toContain("The listed amendments changed nothing");
  });

  // Live run `run-mux6pndp-16feb842` (lane B, round 3) cause 6: no-op keeps
  // beside a `drop` of a step already out (`already_out`) changed nothing just
  // the same, and never heard that keep adds nothing.
  it("is said too when the no-op keeps come with a drop of a step already out", async () => {
    const decide = vi.fn();
    for (const decision of built) decide.mockResolvedValueOnce(decision);
    decide.mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "keep" }, { step: 2, change: "drop" }] })
      .mockResolvedValue(complete);

    await loop(decide);

    const told = check(decide, 4);
    expect(told).toMatchObject({ ok: false, keepAddsNothing: true, applied: 0, refused: [{ step: 1, reason: "already_in_flow" }, { step: 2, reason: "already_out" }] });
    expect(String(told?.instruction).startsWith("keep adds nothing")).toBe(true);
  });

  it("is not said when the decision did anything else, or named a step the Flow does not hold", async () => {
    // A keep beside a drop that landed (0023's shape): the draft changed.
    const dropped = decisions([{ step: 2, change: "keep" }, { step: 1, change: "drop" }]);
    await loop(dropped);
    expect(check(dropped, 3)?.keepAddsNothing).toBeUndefined();
    expect(String(check(dropped, 3)?.instruction)).not.toContain("keep adds nothing");

    // A keep of a step that is not there is a wrong number, not a keep that adds nothing.
    const missing = decisions([{ step: 9, change: "keep" }]);
    await loop(missing);
    expect(check(missing, 3)).toMatchObject({ refused: [{ step: 9, reason: "no_such_step" }] });
    expect(check(missing, 3)?.keepAddsNothing).toBeUndefined();
  });
});
