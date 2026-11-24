// An option the act's step did because the page had it chosen, written onto
// that act's node as what it requires chosen before it runs (t1030). Synthetic
// steps, as `./standing-option.test.ts` builds them; the playback of such a
// node is `framework/.../answer-first/flow-run/tests/saved-flow-road.test.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../draft/index.ts";
import type { AutomationStudioFlowDraftWrittenStep } from "../../authoring/index.ts";
import { AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER, automationStudioFlowDraftWriteWithStandingOptions, automationStudioInstructedStandingPreconditions } from "../index.ts";

const LAMP = "Add one of the brass desk lamps to my basket for collection.";
const PRESS = "web.output.dom-click";
const READ = "web.output.dom-extract";
const AT = { selector: "#branch-collect", element: { tagName: "button", text: "Collection" } };

function step(position: number, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, actionId: PRESS, input: { target: { handle: `h${position}` } }, effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

const added = (chosen: NonNullable<AutomationStudioFlowDraftStep["chosen"]>): AutomationStudioFlowDraftStep[] => [
  step(1, { words: { target: "Make this my branch" }, chosen }),
  step(2, { words: { target: "+ Add" }, acts: ["a1"], chosen })
];

/** A registry whose press takes `requiresChosen` and whose read does not. */
const registry = { get: (id: string) => ({ parameters: id === PRESS ? [{ id: AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER }] : [] }) } as unknown as AutomationStudioNodeRegistry;
const resolution = {} as AutomationStudioNodeRegistryResolution;
const plainWrite = (step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep => ({
  description: step.actionId, node: step.actionId,
  entries: [{ key: "selector", value: "#add" }, ...(Array.isArray(step.input.carried) ? [{ key: AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER, value: JSON.stringify(step.input.carried) }] : [])]
});

describe("an option a saved act requires chosen before it runs", () => {
  it("is the act's own step's option that stood chosen, with what finds it again, and no other step's", () => {
    const required = automationStudioInstructedStandingPreconditions({ instructionText: LAMP, steps: added([{ key: "t40", words: "Collection", at: AT }, { key: "t9", words: "Brass", at: { selector: "#finish" } }]) });
    expect([...required]).toEqual([["d2", [{ at: AT, words: "Collection" }]]]);
  });

  it("is nothing where the host said no way to find it again, another option stood, or a step of the Flow makes the choice", () => {
    expect(automationStudioInstructedStandingPreconditions({ instructionText: LAMP, steps: added([{ key: "t40", words: "Collection" }]) }).size).toBe(0);
    expect(automationStudioInstructedStandingPreconditions({ instructionText: LAMP, steps: added([{ key: "t41", words: "Delivery", at: AT }]) }).size).toBe(0);
    const named = [step(1, { words: { target: "Collection" }, acts: ["a1.fulfilment"] }), ...added([{ key: "t40", words: "Collection", at: AT }]).map((each) => ({ ...each, position: each.position + 1, id: `d${each.position + 1}` }))];
    expect(automationStudioInstructedStandingPreconditions({ instructionText: LAMP, steps: named }).size).toBe(0);
    expect(automationStudioInstructedStandingPreconditions({ instructionText: "Show me the brass desk lamps as a table.", steps: added([{ key: "t40", words: "Collection", at: AT }]) }).size).toBe(0);
  });

  it("is written onto the act's node where its definition takes it, replacing any the step carried, and onto no other", () => {
    const steps = added([{ key: "t40", words: "Collection", at: AT }]);
    const write = automationStudioFlowDraftWriteWithStandingOptions(plainWrite, { steps, instructionText: LAMP, registry, resolution });
    expect(write(steps[1]!)?.entries).toEqual([{ key: "selector", value: "#add" }, { key: AUTOMATION_STUDIO_REQUIRES_CHOSEN_PARAMETER, value: JSON.stringify([{ at: AT, words: "Collection" }]) }]);
    expect(write(steps[0]!)?.entries).toEqual([{ key: "selector", value: "#add" }]);
    // A step carrying one from an earlier Flow, which no option of the person's now stands for, has it dropped.
    const carried = step(3, { input: { carried: [{ at: { selector: "#old" }, words: "Old" }] } });
    expect(write(carried)?.entries).toEqual([{ key: "selector", value: "#add" }]);
    // A node that does not take it is written as it was.
    const onRead = automationStudioFlowDraftWriteWithStandingOptions(plainWrite, { steps: steps.map((each) => ({ ...each, actionId: READ })), instructionText: LAMP, registry, resolution });
    expect(onRead({ ...steps[1]!, actionId: READ })?.entries).toEqual([{ key: "selector", value: "#add" }]);
  });
});
