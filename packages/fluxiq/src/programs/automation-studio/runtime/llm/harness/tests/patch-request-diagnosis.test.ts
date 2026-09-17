import { describe, expect, it } from "vitest";
import { packAutomationStudioLlmContext } from "../context-packet.ts";
import type { AutomationStudioLlmHarnessInput } from "../task-request.ts";

// The patch stage is told to "carry out the plan you just stated", and the plan
// was not in the request. The diagnosis the model produced one call earlier --
// what it expected, what it observed, what it thinks changed, and its four
// verdicts -- reaches the patch request now, bounded field by field.
//
// It is a runtime-patch slot only. A diagnosis request would be shown its own
// answer, and every other task has no such answer to be shown.

const DIAGNOSIS = {
  expected: "The recorded Save control ends the edit and returns to the list.",
  observed: "Nothing matched; the closest control was refused at 0.36.",
  changed: "The edit pane now offers Save changes and exit instead.",
  stillAchievable: "unknown",
  deterministicRecoveryPossible: "no",
  explorationNeeded: true,
  patchNeeded: true
} as const;

describe("carrying the diagnosis into the patch request", () => {
  it("carries every diagnosis field the model produced, as a copy", () => {
    const packed = packAutomationStudioLlmContext(patchInput({ diagnosis: { ...DIAGNOSIS } }));
    expect(packed.diagnosis).toEqual(DIAGNOSIS);
    expect(packed.diagnosis).not.toBe(DIAGNOSIS);
  });

  it("carries only the fields the diagnosis channel names, and bounds each text", () => {
    const packed = packAutomationStudioLlmContext(patchInput({
      diagnosis: {
        ...DIAGNOSIS,
        expected: "x".repeat(900),
        // Not a diagnosis field. The channel is a fixed set of keys, so an
        // extra one is dropped rather than carried into the request.
        target: "[data-testid=\"save\"]",
        stillAchievable: "maybe"
      } as never
    }));
    expect(packed.diagnosis?.expected).toHaveLength(500);
    expect(Object.keys(packed.diagnosis ?? {}).sort()).toEqual([
      "changed", "deterministicRecoveryPossible", "expected", "explorationNeeded", "observed", "patchNeeded"
    ]);
    expect(JSON.stringify(packed)).not.toContain("data-testid");
  });

  it("omits the slot when the diagnosis produced nothing worth carrying", () => {
    expect(packAutomationStudioLlmContext(patchInput({})).diagnosis).toBeUndefined();
    expect(packAutomationStudioLlmContext(patchInput({ diagnosis: {} })).diagnosis).toBeUndefined();
    expect(packAutomationStudioLlmContext(patchInput({ diagnosis: { expected: "   " } })).diagnosis).toBeUndefined();
  });

  it("refuses the slot on any task that is not a runtime patch", () => {
    for (const taskKind of ["runtime_diagnosis", "flow_bootstrap", "change_proposal_generation", "router_patch"] as const) {
      expect(() => packAutomationStudioLlmContext({ ...patchInput({ diagnosis: { ...DIAGNOSIS } }), taskKind }))
        .toThrow(/runtime patch/i);
    }
  });
});

function patchInput(extra: Partial<AutomationStudioLlmHarnessInput>): AutomationStudioLlmHarnessInput {
  return {
    taskKind: "runtime_patch",
    projectId: "project.one",
    flowId: "flow.one",
    runId: "run.one",
    nodeId: "node.save",
    instructions: [],
    ...extra
  };
}
