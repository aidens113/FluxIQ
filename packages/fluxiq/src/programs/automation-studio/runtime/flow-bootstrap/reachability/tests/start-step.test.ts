import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep, AutomationStudioFlowDraftStepDisposition } from "../../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftWithStartStep } from "../start-step.ts";

// The step that took a build to where its Flow starts is kept in the Flow.
//
// The runs behind this: both bigbox builds (`run-mulx76vv-a882551e`,
// `run-mum0ke7z-940cbd27`) ran the navigation first -- from a blank tab the
// domain lets nothing else run -- and then withdrew it with an amendment, so
// completion was refused `bootstrap.cannot_reach_start_location` and the model
// spent a turn, at the end of its budget, putting back a step it had run.

const START = "https://shop.test/collections/audio";

let nextId = 0;
function step(position: number, parameters: JsonObject, options: { disposition?: AutomationStudioFlowDraftStepDisposition; effectApplied?: boolean; ranWith?: JsonObject; routing?: AutomationStudioFlowDraftStep["routing"] } = {}): AutomationStudioFlowDraftStep {
  nextId += 1;
  return {
    position,
    id: `d${nextId}`,
    iteration: position,
    actionId: typeof parameters.url === "string" ? "web.output.browser-navigate" : "web.output.dom-click",
    toolId: "run_node",
    input: { node: "any", parameters },
    ...(options.ranWith ? { ranWith: options.ranWith } : {}),
    effect: "mutate",
    effectApplied: options.effectApplied ?? true,
    disposition: options.disposition ?? "kept",
    ...(options.routing ? { routing: options.routing } : {})
  };
}

const goTo = (position: number, options?: Parameters<typeof step>[2]) => step(position, { url: START }, options);
const press = (position: number, options?: Parameters<typeof step>[2]) => step(position, { target: `h${position}` }, options);

function restore(steps: AutomationStudioFlowDraftStep[], ...startLocation: [string?]) {
  return automationStudioFlowBootstrapDraftWithStartStep({ steps, startLocation: startLocation.length ? startLocation[0] : START });
}

describe("completion keeps the step that arrived where the Flow starts", () => {
  it("puts back a navigation the model dropped, as the first step", () => {
    const steps = [goTo(1, { disposition: "dropped" }), press(2), press(3)];

    const result = restore(steps);

    expect(result.restored).toEqual({ position: 1, id: steps[0]!.id, withdrawnAs: "dropped" });
    expect(result.steps.map((entry) => [entry.position, entry.actionId, entry.disposition])).toEqual([
      [1, "web.output.browser-navigate", "kept"],
      [2, "web.output.dom-click", "kept"],
      [3, "web.output.dom-click", "kept"]
    ]);
  });

  it("puts back one it called exploratory, and makes it unconditional as keep does", () => {
    const steps = [goTo(1, { disposition: "exploratory", routing: { kind: "optional" } }), press(2)];

    const result = restore(steps);

    expect(result.steps[0]).toMatchObject({ disposition: "kept" });
    expect(result.steps[0]!.routing).toBeUndefined();
    expect(result.restored?.withdrawnAs).toBe("exploratory");
  });

  it("moves an arrival that was reordered behind the steps that act, ahead of them", () => {
    const steps = [press(1), press(2), goTo(3, { disposition: "dropped" })];

    const result = restore(steps);

    expect(result.steps.map((entry) => [entry.position, entry.id])).toEqual([[1, steps[2]!.id], [2, steps[0]!.id], [3, steps[1]!.id]]);
  });

  it("leaves a withdrawn step that never took effect where it was: it never arrived", () => {
    const steps = [goTo(1, { disposition: "dropped", effectApplied: false }), press(2)];

    expect(restore(steps)).toEqual({ steps });
  });

  it("reads what the step ran with before what it was written with", () => {
    const steps = [step(1, { url: "handle-7" }, { disposition: "dropped", ranWith: { parameters: { url: `${START}?ref=home` } } }), press(2)];

    expect(restore(steps).restored).toEqual({ position: 1, id: steps[0]!.id, withdrawnAs: "dropped" });
  });

  it("restores the earliest of several withdrawn arrivals, and only that one", () => {
    const steps = [goTo(1, { disposition: "dropped" }), press(2), goTo(3, { disposition: "dropped" })];

    const result = restore(steps);

    expect(result.restored?.position).toBe(1);
    expect(result.steps.filter((entry) => entry.disposition === "kept")).toHaveLength(2);
  });

  it("does not copy or touch the loop's own draft", () => {
    const steps = [goTo(1, { disposition: "dropped" }), press(2)];

    restore(steps);

    expect(steps[0]!.disposition).toBe("dropped");
  });
});

describe("it changes nothing it has no reason to", () => {
  it("leaves a draft whose kept steps already go there", () => {
    const steps = [goTo(1), press(2), goTo(3, { disposition: "dropped" })];

    expect(restore(steps)).toEqual({ steps });
  });

  it("leaves a build that was handed its target rather than told where it starts", () => {
    const steps = [goTo(1, { disposition: "dropped" }), press(2)];

    expect(restore(steps, undefined)).toEqual({ steps });
    expect(restore(steps, "   ")).toEqual({ steps });
  });

  it("invents nothing: with no withdrawn step that went there, the check refuses as before", () => {
    const steps = [step(1, { url: "https://elsewhere.test/" }, { disposition: "dropped" }), press(2)];

    expect(restore(steps)).toEqual({ steps });
  });

  it("does not make a Flow out of a draft whose every step was withdrawn", () => {
    const steps = [goTo(1, { disposition: "dropped" }), press(2, { disposition: "dropped" })];

    expect(restore(steps)).toEqual({ steps });
  });
});
