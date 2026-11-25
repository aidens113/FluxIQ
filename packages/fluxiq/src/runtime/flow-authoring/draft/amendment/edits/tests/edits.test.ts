// The seven edits, applied where the framework drafts the Flow (`../index.ts`, `../../apply.ts`).
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES, AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_SCHEMA, applyAutomationStudioFlowDraftAmendments } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../step.ts";
import { automationStudioFlowDraftCompose } from "../../../compose/index.ts";

type Step = AutomationStudioFlowDraftStep;

function read(n: number, over: Partial<Step> = {}): Step {
  return { position: n, id: `d${n}`, iteration: n, actionId: "web.read", toolId: "core.run_node", input: { node: "web.read", parameters: { list: `l${n}` } }, effect: "observe", proposes: true, effectApplied: true, stateBefore: `s${n}`, stateAfter: `s${n}`, disposition: "kept", ...over };
}

function press(n: number, over: Partial<Step> = {}): Step {
  return { position: n, id: `d${n}`, iteration: n, actionId: "web.dom.click", toolId: "core.run_node", input: { node: "web.dom.click", parameters: { target: { handle: `t${n}` } } }, effect: "mutate", effectApplied: true, stateBefore: `s${n}`, stateAfter: `s${n + 1}`, disposition: "kept", ...over };
}

describe("the edit schema and its changes", () => {
  it("names the seven edits, the only changes there are", () => {
    expect(AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES).toEqual(["keep", "drop", "result", "repeat", "unrepeat", "bind", "rerun"]);
  });

  it("carries the keys of the edits and no others", () => {
    const properties = AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_SCHEMA.properties as Record<string, { enum?: string[]; description: string }>;
    expect(Object.keys(properties).sort()).toEqual(["act", "change", "input", "most", "over", "place", "step", "through", "while"]);
    expect(properties.change!.enum).toEqual([...AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES]);
  });
});

describe("rerun", () => {
  it("is left to the loop, which carries it out: the draft itself refuses it run_by_the_loop", () => {
    const steps = [press(1), press(2, { disposition: "taken", drafted: "did_not_work", effectApplied: false })];
    const before = structuredClone(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "rerun", input: { parameters: { target: { handle: "t9" } } } }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "run_by_the_loop" }] });
    expect(steps).toEqual(before);
  });

  // The one internal caller (`../../../../../llm/evidence-loop/rerun/replacement.ts`): the attempt a rerun replaced is
  // withdrawn by Core, not by the model, so the framework still drafts it; a model's drop makes the step its own.
  it("leaves the attempt a rerun replaced the framework's when Core withdraws it, and makes a model's drop the model's", () => {
    const core = [press(1, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(core, [{ step: 1, change: "drop" }], { withdrawsReplacedAttempt: true })).toEqual({ applied: 1, refused: [] });
    expect(core[0]).toMatchObject({ disposition: "dropped", drafted: "in" });
    const model = [press(1, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(model, [{ step: 1, change: "drop" }])).toEqual({ applied: 1, refused: [] });
    expect(model[0]).toMatchObject({ disposition: "dropped" });
    expect(model[0]).not.toHaveProperty("drafted");
  });
});

describe("keep", () => {
  it("puts back a step the framework left out and deletes its drafted word", () => {
    const steps = [press(1), press(2, { disposition: "taken", drafted: "dead_end", stateBefore: "s9", stateAfter: "s10" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "keep", act: "a1" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept", acts: ["a1"] });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("gets the refusals a step put in gets: a left-out look cannot be put back, a second copy is refused", () => {
    const look = [press(1), read(2, { disposition: "taken", drafted: "look", proposes: false, effect: "observe" })];
    expect(applyAutomationStudioFlowDraftAmendments(look, [{ step: 2, change: "keep" }]).refused).toEqual([{ step: 2, reason: "not_a_kept_step" }]);
    const copy = [press(1, { stateBefore: "a", stateAfter: "b" }), press(2, { stateBefore: "a", stateAfter: "b", input: { node: "web.dom.click", parameters: { target: { handle: "t1" } } }, disposition: "taken", drafted: "repeat" })];
    expect(applyAutomationStudioFlowDraftAmendments(copy, [{ step: 2, change: "keep" }]).refused).toEqual([{ step: 2, reason: "second_copy", copyOf: 1 }]);
    expect(copy[1]).toMatchObject({ disposition: "taken", drafted: "repeat" });
  });

  it("makes a step the framework put in the model's, so the framework never decides it again", () => {
    const steps = [press(1, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[0]).toMatchObject({ disposition: "kept" });
    expect(steps[0]).not.toHaveProperty("drafted");
  });

  it("is still refused already_in_flow on a step the model already kept", () => {
    const steps = [press(1)];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "keep" }]).refused).toEqual([{ step: 1, reason: "already_in_flow" }]);
  });
});

describe("drop", () => {
  it("takes a step out and deletes its drafted word", () => {
    const steps = [press(1), read(2, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "dropped" });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("is refused already_out on a step the model already dropped", () => {
    const steps = [press(1), read(2, { disposition: "dropped" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "drop" }]).refused).toEqual([{ step: 2, reason: "already_out" }]);
  });
});

describe("result", () => {
  it("makes a read the result, puts it in, and deletes its drafted word", () => {
    const steps = [press(1), read(2, { disposition: "taken", drafted: "not_the_result" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "result" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept", result: true });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("is refused not_a_read on a step that does something", () => {
    const steps = [press(1), read(2)];
    const before = structuredClone(steps);
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "result" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "not_a_read" }] });
    expect(steps).toEqual(before);
  });

  it("is refused already_so on the read that already is the result", () => {
    const steps = [press(1), read(2, { result: true })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "result" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
  });
});

describe("repeat and unrepeat", () => {
  it("repeats a step over a read, deleting the drafted word of the step", () => {
    const steps = [read(1), press(2, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "repeat", over: 1 }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]!.routing).toMatchObject({ kind: "repeat", over: "d1", through: "d2" });
    expect(steps[1]).not.toHaveProperty("drafted");
  });

  it("puts a left-out read in when the repeat is over it", () => {
    const steps = [read(1, { disposition: "taken", drafted: "not_the_result" }), press(2, { drafted: "in" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "repeat", over: 1 }])).toEqual({ applied: 1, refused: [] });
    expect(steps[0]).toMatchObject({ disposition: "kept" });
    expect(steps[0]).not.toHaveProperty("drafted");
  });

  it("leaves the read out when the repeat is refused", () => {
    const steps = [read(1, { disposition: "taken", drafted: "not_the_result" }), press(2, { drafted: "in" })];
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "repeat", over: 7 }]);
    expect(report.applied).toBe(0);
    expect(steps[0]).toMatchObject({ disposition: "taken", drafted: "not_the_result" });
  });

  // The paging pattern (t1037 phase 2): read, Next page, then the read repeated while Next page works. The framework left
  // the press out as leading nowhere after the only read; the repeat names it and puts it in.
  it("puts in the press a repeat's while and through name, and keeps the span the model's on a recompose", () => {
    const steps = [read(1, { drafted: "in" }), press(2, { disposition: "taken", drafted: "dead_end" })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "repeat", while: 2, through: 2 }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).toMatchObject({ disposition: "kept" });
    expect(steps[1]).not.toHaveProperty("drafted");
    expect(steps[0]).not.toHaveProperty("drafted");
    expect(steps[0]!.routing).toMatchObject({ kind: "repeat", through: "d2", while: "d2" });
    const recomposed = automationStudioFlowDraftCompose({ steps });
    expect(recomposed.map((step) => [step.disposition, step.drafted])).toEqual([["kept", undefined], ["kept", undefined]]);
  });

  it("puts the press back out when the repeat that named it is refused", () => {
    const steps = [read(1, { drafted: "in" }), press(2, { disposition: "taken", drafted: "dead_end" })];
    const report = applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "repeat", while: 2, through: 2 }], { loopNeverEnds: () => "Step 2 can never say the list ended." });
    expect(report.applied).toBe(0);
    expect(report.refused).toEqual([expect.objectContaining({ step: 1, reason: "repeat_never_ends" })]);
    expect(steps[1]).toMatchObject({ disposition: "taken", drafted: "dead_end" });
    expect(steps[0]).not.toHaveProperty("routing");
  });

  it("takes a repeat off with unrepeat", () => {
    const steps = [read(1), press(2, { routing: { kind: "repeat", over: "d1", through: "d2" } })];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 2, change: "unrepeat" }])).toEqual({ applied: 1, refused: [] });
    expect(steps[1]).not.toHaveProperty("routing");
  });
});

describe("bind", () => {
  it("lifts a typed value into an input", () => {
    const typed: Step = { ...press(1), actionId: "web.dom.type", input: { node: "web.dom.type", parameters: { text: "shoes" } } };
    const steps = [typed];
    expect(applyAutomationStudioFlowDraftAmendments(steps, [{ step: 1, change: "bind", input: { text: { $input: "term", test: "shoes" } } }])).toEqual({ applied: 1, refused: [] });
  });
});
