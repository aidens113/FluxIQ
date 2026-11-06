// A step is left out only when no step of the saved Flow does its act (t869).
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstLeftOutSteps } from "../index.ts";

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, actionId: "press", input: { node: "press", parameters: { target: `t${position}` }, consequences: ["modify_existing"] }, effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", ...over
});
const dropped = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}) => step(position, { disposition: "dropped", ...over });

describe("the steps left out of a saved Flow", () => {
  it("names a dropped step nothing else does", () => {
    expect(automationStudioAnswerFirstLeftOutSteps([step(1), dropped(2, { control: "Save" })])).toEqual(["Save"]);
  });

  it("does not name a dropped Save the Flow still presses with a check on its state (the case seen)", () => {
    const saved = step(3, { control: "Save", words: { target: "Save" }, input: { node: "press", parameters: { target: "t2", ensureState: "checked" }, consequences: ["modify_existing"] } });
    expect(automationStudioAnswerFirstLeftOutSteps([step(1), dropped(2, { control: "Save", words: { target: "Save" }, input: { node: "press", parameters: { target: "t2" }, consequences: ["modify_existing"] } }), saved])).toEqual([]);
    const sameNode = step(3, { input: { node: "press", parameters: { target: "t2", ensureState: "checked" }, consequences: ["modify_existing"] } });
    expect(automationStudioAnswerFirstLeftOutSteps([dropped(2, { input: { node: "press", parameters: { target: "t2" }, consequences: ["modify_existing"] } }), sameNode])).toEqual([]);
  });

  it("does not name a step a rerun replaced, one that stands for it, or one that names its act", () => {
    expect(automationStudioAnswerFirstLeftOutSteps([dropped(1, { replacedBy: "d9" }), step(2, { id: "d9" })])).toEqual([]);
    expect(automationStudioAnswerFirstLeftOutSteps([dropped(1, { id: "f1" }), step(2, { standsFor: "f1" })])).toEqual([]);
    expect(automationStudioAnswerFirstLeftOutSteps([dropped(1, { acts: ["a1"] }), step(2, { acts: ["a1"] })])).toEqual([]);
  });
});

describe("a left-out step is never named by its position or an id", () => {
  it("says what a step with no words did, and not Step N", () => {
    expect(automationStudioAnswerFirstLeftOutSteps([dropped(13)])).toEqual(["one step that did something on the site"]);
  });

  it("does not quote an id or a handle as a name", () => {
    expect(automationStudioAnswerFirstLeftOutSteps([dropped(2, { control: "t622" }), dropped(3, { words: { target: "d7" } })])).toEqual(["one step that did something on the site", "one step that did something on the site"]);
  });
});
