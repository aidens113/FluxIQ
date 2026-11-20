// t975, F4: the act a loop already does, kept again right after the loop.
// Run `run-mwouhs7i-b22d9399` kept three presses of Next page, then wrote the
// page loop over the first; the other two stayed after the loop and every
// replay stopped on them (`executor.graph.unmatched_route`). The draft below
// is that build's, as recorded (`./recorded-draft.ts`).
import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments } from "../../amendment/index.ts";
import { automationStudioFlowDraftEntry } from "../../entry.ts";
import { automationStudioFlowDraftSecondCopy } from "../../second-copy.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftLoopCoveringStep, automationStudioFlowDraftSettleLoopCovered } from "../index.ts";
import { recordedApprenticesDraft } from "./recorded-draft.ts";

const inFlow = (steps: readonly AutomationStudioFlowDraftStep[]): number[] => steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => step.position);
const at = (steps: readonly AutomationStudioFlowDraftStep[], position: number): AutomationStudioFlowDraftStep => steps.find((step) => step.position === position)!;

describe("the recorded apprentices draft", () => {
  it("before the loop, the three kept presses are all in the Flow and nothing covers them", () => {
    const steps = recordedApprenticesDraft();
    expect(inFlow(steps)).toEqual([1, 3, 6, 9, 10, 11]);
    expect(steps.map((step) => automationStudioFlowDraftLoopCoveringStep(steps, step))).toEqual(steps.map(() => undefined));
  });

  it("the decision that writes the loop takes the presses after it out, each naming the loop's last step", () => {
    const steps = recordedApprenticesDraft();
    const amended = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "repeat", while: 9 }]);

    expect(amended).toEqual({ applied: 1, refused: [] });
    expect(at(steps, 6).routing).toEqual({ kind: "repeat", through: "d9", while: "d9" });
    expect(inFlow(steps)).toEqual([1, 3, 6, 9]);
    expect([at(steps, 10), at(steps, 11)].map((step) => [step.disposition, step.coveredBy])).toEqual([["dropped", "d9"], ["dropped", "d9"]]);
    // The press the model never added stays as it was: evidence, not a step.
    expect(at(steps, 12).disposition).toBe("taken");
    expect(at(steps, 12).coveredBy).toBeUndefined();
  });

  it("the draft entry says why each one is out, in the numbers the model reads", () => {
    const steps = recordedApprenticesDraft();
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "repeat", while: 9 }]);
    const lines = (automationStudioFlowDraftEntry({ steps, authored: true })!.value as { steps: Array<{ step: number; inResult: boolean; out?: string }> }).steps;
    const ten = lines.find((line) => line.step === 10)!;
    expect(ten.inResult).toBe(false);
    expect(ten.out).toContain("the loop ending at step 9 already does this step's act");
    expect(lines.find((line) => line.step === 9)!.out).toBeUndefined();
  });

  it("adding a covered press back is refused as a second copy of the loop's last step, and changes nothing", () => {
    const steps = recordedApprenticesDraft();
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "repeat", while: 9 }]);
    const before = structuredClone(steps);
    const again = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 10, change: "add" }, { step: 12, change: "add" }]);
    expect(again).toEqual({ applied: 0, refused: [{ step: 10, reason: "second_copy", copyOf: 9 }, { step: 12, reason: "second_copy", copyOf: 9 }] });
    expect(steps).toEqual(before);
    // The same refusal a call with `add` meets (`../../../../llm/decision-handlers/second-copy.ts`).
    expect(automationStudioFlowDraftSecondCopy(steps, at(steps, 12))).toBe(at(steps, 9));
  });

  it("taking the loop off puts the presses back as they were", () => {
    const steps = recordedApprenticesDraft();
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "repeat", while: 9 }]);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "unrepeat" }])).toEqual({ applied: 1, refused: [] });
    expect(inFlow(steps)).toEqual([1, 3, 6, 9, 10, 11]);
    expect(steps.some((step) => step.coveredBy !== undefined)).toBe(false);
  });

  it("a loop the person bounded with most covers nothing: it may stop before the list ends", () => {
    const steps = recordedApprenticesDraft();
    applyAutomationStudioFlowDraftAmendments(steps, [{ step: 6, change: "repeat", while: 9, most: 2 }]);
    expect(at(steps, 6).routing).toEqual({ kind: "repeat", through: "d9", while: "d9", most: 2 });
    expect(inFlow(steps)).toEqual([1, 3, 6, 9, 10, 11]);
  });
});

/** A step run through one node, in the shape the loop appends it. */
function ran(position: number, actionId: string, parameters: Record<string, string>, extra: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, toolId: "core.run_node", actionId, input: { node: actionId, parameters },
    effect: actionId === "read" ? "observe" : "mutate", ...(actionId === "read" ? { proposes: true } : {}), effectApplied: true, disposition: "kept", ...extra
  };
}

describe("what a loop covers, and what it does not", () => {
  const loop = (): AutomationStudioFlowDraftStep[] => [
    ran(1, "open", { url: "https://example.test/archive" }),
    ran(2, "read", { list: "entries" }, { routing: { kind: "repeat", through: "d3", while: "d3" } }),
    ran(3, "more", { list: "entries" })
  ];

  it("covers only the loop's own act with the same parameters, directly after it", () => {
    const steps = [...loop(), ran(4, "more", { list: "other" }), ran(5, "more", { list: "entries" })];
    expect(automationStudioFlowDraftSettleLoopCovered(steps)).toEqual({ takenOut: [], putBack: [] });
    expect(inFlow(steps)).toEqual([1, 2, 3, 4, 5]);
  });

  it("leaves a different act after the loop alone, and every copy in a row after it goes", () => {
    const steps = [...loop(), ran(4, "more", { list: "entries" }), ran(5, "more", { list: "entries" }), ran(6, "read", { list: "entries", where: "open" })];
    const settled = automationStudioFlowDraftSettleLoopCovered(steps);
    expect(settled.takenOut.map((step) => step.position)).toEqual([4, 5]);
    expect(inFlow(steps)).toEqual([1, 2, 3, 6]);
  });

  it("never covers a step that says when it runs, or a copy that follows a loop over a list's rows", () => {
    const optional = [...loop(), ran(4, "more", { list: "entries" }, { routing: { kind: "optional" } })];
    expect(automationStudioFlowDraftSettleLoopCovered(optional).takenOut).toEqual([]);
    const rows = [ran(1, "read", { list: "entries" }), ran(2, "confirm", { row: "x" }, { routing: { kind: "repeat", through: "d2", over: "d1" } }), ran(3, "confirm", { row: "x" })];
    expect(automationStudioFlowDraftSettleLoopCovered(rows).takenOut).toEqual([]);
  });

  it("moves an act claimed on a covered copy to the loop's last step", () => {
    const steps = [...loop(), ran(4, "more", { list: "entries" }, { acts: ["a1"] })];
    automationStudioFlowDraftSettleLoopCovered(steps);
    expect(at(steps, 4).acts).toBeUndefined();
    expect(at(steps, 3).acts).toEqual(["a1"]);
  });
});
