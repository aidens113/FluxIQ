// The six edits of the reduced grammar, applied where the framework drafts the Flow
// (`../index.ts`, `../../apply.ts` with `grammar: "framework"`). Without the option nothing changes.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES, AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA, AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES, AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_SCHEMA, applyAutomationStudioFlowDraftAmendments } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../step.ts";

type Step = AutomationStudioFlowDraftStep;
const framework = { grammar: "framework" } as const;

function read(n: number, over: Partial<Step> = {}): Step {
  return { position: n, id: `d${n}`, iteration: n, actionId: "web.read", toolId: "core.run_node", input: { node: "web.read", parameters: { list: `l${n}` } }, effect: "observe", proposes: true, effectApplied: true, stateBefore: `s${n}`, stateAfter: `s${n}`, disposition: "kept", ...over };
}

function press(n: number, over: Partial<Step> = {}): Step {
  return { position: n, id: `d${n}`, iteration: n, actionId: "web.dom.click", toolId: "core.run_node", input: { node: "web.dom.click", parameters: { target: { handle: `t${n}` } } }, effect: "mutate", effectApplied: true, stateBefore: `s${n}`, stateAfter: `s${n + 1}`, disposition: "kept", ...over };
}

describe("the edit schema and its changes", () => {
  it("names the six edits, and the old grammar's thirteen stay exactly as they were", () => {
    expect(AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES).toEqual(["keep", "drop", "result", "repeat", "unrepeat", "bind"]);
    expect(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES).toHaveLength(13);
    expect(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES).not.toContain("result");
    const old = AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as { change: { enum: string[] } };
    expect(old.change.enum).toEqual([...AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES]);
  });

  it("carries the keys of the edits and no others", () => {
    const properties = AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_SCHEMA.properties as Record<string, { enum?: string[]; description: string }>;
    expect(Object.keys(properties).sort()).toEqual(["act", "change", "input", "most", "over", "place", "step", "through", "while"]);
    expect(properties.change!.enum).toEqual([...AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES]);
  });
});

describe("a change outside the six edits", () => {
  it("is refused not_an_edit, whatever it names, and changes nothing", () => {
    for (const change of ["add", "take", "exploratory", "reorder", "rerun", "optional", "only_if", "on_failed"] as const) {
      const steps = [press(1), press(2, { disposition: "taken", drafted: "dead_end" })];
      const before = structuredClone(steps);
      expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change, to: 1 }], framework)).toEqual({ applied: 0, refused: [{ step: 2, reason: "not_an_edit" }] });
      expect(steps).toEqual(before);
    }
  });

  it("is applied as it always was without the option", () => {
    const steps = [press(1), press(2, { disposition: "taken", drafted: "dead_end" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "add" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept", drafted: "dead_end" });
  });
});

describe("keep", () => {
  it("puts back a step the framework left out, as add does, and deletes its drafted word", () => {
    const steps = [press(1), press(2, { disposition: "taken", drafted: "dead_end", stateBefore: "s9", stateAfter: "s10" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "keep", act: "a1" }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept", acts: ["a1"] });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("gets the refusals add gets: a left-out look cannot be put back, a second copy is refused", () => {
    const look = [press(1), read(2, { disposition: "taken", drafted: "look", proposes: false, effect: "observe" })];
    expect(applyAutomationStudioFlowDraftAmendments(look, [{ step: 2, change: "keep" }], framework).refused).toEqual([{ step: 2, reason: "not_a_kept_step" }]);
    const copy = [press(1, { stateBefore: "a", stateAfter: "b" }), press(2, { stateBefore: "a", stateAfter: "b", input: { node: "web.dom.click", parameters: { target: { handle: "t1" } } }, disposition: "taken", drafted: "repeat" })];
    expect(applyAutomationStudioFlowDraftAmendments(copy, [{ step: 2, change: "keep" }], framework).refused).toEqual([{ step: 2, reason: "second_copy", copyOf: 1 }]);
    expect(copy[1]).toMatchObject({ disposition: "taken", drafted: "repeat" });
  });

  it("makes a step the framework put in the model's, so the framework never decides it again", () => {
    const steps = [press(1, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep" }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[0]).toMatchObject({ disposition: "kept" });
    expect(steps[0]).not.toHaveProperty("drafted");
  });

  it("is still refused already_in_flow on a step the model already kept", () => {
    const steps = [press(1)];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep" }], framework).refused).toEqual([{ step: 1, reason: "already_in_flow" }]);
  });
});

describe("drop", () => {
  it("takes a step out and deletes its drafted word", () => {
    const steps = [press(1), read(2, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "dropped" });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("is refused already_out on a step the model already dropped", () => {
    const steps = [press(1), read(2, { disposition: "dropped" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }], framework).refused).toEqual([{ step: 2, reason: "already_out" }]);
  });
});

describe("result", () => {
  it("makes a read the result, puts it in, and deletes its drafted word", () => {
    const steps = [press(1), read(2, { disposition: "taken", drafted: "not_the_result" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "result" }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept", result: true });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("is refused not_a_read on a step that does something", () => {
    const steps = [press(1), read(2)];
    const before = structuredClone(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "result" }], framework)).toEqual({ applied: 0, refused: [{ step: 1, reason: "not_a_read" }] });
    expect(steps).toEqual(before);
  });

  it("is refused already_so on the read that already is the result", () => {
    const steps = [press(1), read(2, { result: true })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "result" }], framework)).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
  });
});

describe("repeat and unrepeat", () => {
  it("repeats a step over a read, deleting the drafted word of the step", () => {
    const steps = [read(1), press(2, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "repeat", over: 1 }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[1]!.routing).toMatchObject({ kind: "repeat", over: "d1", through: "d2" });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("puts a left-out read in when the repeat is over it", () => {
    const steps = [read(1, { disposition: "taken", drafted: "not_the_result" }), press(2, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "repeat", over: 1 }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[0]).toMatchObject({ disposition: "kept" });
    expect(steps[0]).not.toHaveProperty("drafted");
  });

  it("leaves the read out when the repeat is refused", () => {
    const steps = [read(1, { disposition: "taken", drafted: "not_the_result" }), press(2, { drafted: "in" })];
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "repeat", over: 7 }], framework);
    expect(report.applied).toBe(0);
    expect(steps[0]).toMatchObject({ disposition: "taken", drafted: "not_the_result" });
  });

  it("takes a repeat off with unrepeat", () => {
    const steps = [read(1), press(2, { routing: { kind: "repeat", over: "d1", through: "d2" } })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "unrepeat" }], framework)).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).not.toHaveProperty("routing");
  });
});

describe("bind", () => {
  it("lifts a typed value into an input", () => {
    const typed: Step = { ...press(1), actionId: "web.dom.type", input: { node: "web.dom.type", parameters: { text: "shoes" } } };
    const steps = [typed];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "bind", input: { text: { $input: "term", test: "shoes" } } }], framework)).toEqual({ applied: 1, refused: [] });
  });
});
