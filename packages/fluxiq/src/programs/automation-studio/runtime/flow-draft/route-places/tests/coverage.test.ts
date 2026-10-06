// Whether the steps in the Flow go through every place on the route the
// person named, in order, by the places the model says each step is on
// (D phase 2, `docs/working/mvp-live-continuation-2026-10-03/reports/d-grounded-waypoint-contract.md`).

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftRouteCoverage } from "../index.ts";

function step(position: number, places?: string[], over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, actionId: "press", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...(places ? { places } : {}), ...over };
}

describe("the route a Flow goes through", () => {
  it("is covered when every place has a step in the Flow, in the route's order", () => {
    expect(automationStudioFlowDraftRouteCoverage([step(1, ["r1"]), step(2), step(3, ["r2"]), step(4, ["r3"])], 3)).toEqual({ missing: [], outOfOrder: [] });
  });

  it("misses the middle place when the only step on it is out of the Flow", () => {
    const steps = [step(1, ["r1"]), step(2, ["r2"], { disposition: "dropped" }), step(3, ["r3"])];
    expect(automationStudioFlowDraftRouteCoverage(steps, 3)).toEqual({ missing: ["r2"], outOfOrder: [] });
  });

  it("lets several steps be on one place, and one step be on two", () => {
    expect(automationStudioFlowDraftRouteCoverage([step(1, ["r1"]), step(2, ["r2"]), step(3, ["r2"]), step(4, ["r2", "r3"])], 3)).toEqual({ missing: [], outOfOrder: [] });
  });

  it("names a place first reached before an earlier place", () => {
    expect(automationStudioFlowDraftRouteCoverage([step(1, ["r1"]), step(2, ["r3"]), step(3, ["r2"])], 3)).toEqual({ missing: [], outOfOrder: ["r3"] });
  });

  it("reads only steps in the Flow, and ignores a place not on the route", () => {
    const steps = [step(1, ["r1"]), step(2, ["r2"], { disposition: "taken" }), step(3, ["r9"])];
    expect(automationStudioFlowDraftRouteCoverage(steps, 2)).toEqual({ missing: ["r2"], outOfOrder: [] });
  });
});
