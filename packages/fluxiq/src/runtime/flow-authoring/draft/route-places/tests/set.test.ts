// Saying which places on the named route a step is on: the newest word for a
// step replaces its own, and never touches another step's (D phase 2).

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE, automationStudioFlowDraftSetRoutePlaces } from "../index.ts";

const step = (places?: string[]): AutomationStudioFlowDraftStep =>
  ({ position: 1, iteration: 1, actionId: "press", input: {}, effect: "mutate", effectApplied: true, disposition: "kept", ...(places ? { places } : {}) });

describe("the places a step is on", () => {
  it("accepts one place, several, or none, and nothing else", () => {
    for (const value of ["r1", "r12", "r1,r2", "none"]) expect(AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE.test(value)).toBe(true);
    for (const value of ["", "r0", "r100", "a1", "r1, r2", "r1,", "none,r1", "R1"]) expect(AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE.test(value)).toBe(false);
  });

  it("replaces the step's own places, in the route's order and once each, and says whether anything changed", () => {
    const claimed = step(["r1"]);
    expect(automationStudioFlowDraftSetRoutePlaces(claimed, "r3,r2,r3")).toBe(true);
    expect(claimed.places).toEqual(["r2", "r3"]);
    expect(automationStudioFlowDraftSetRoutePlaces(claimed, "r2,r3")).toBe(false);
  });

  it("clears them with none, leaving no empty list behind", () => {
    const claimed = step(["r1"]);
    expect(automationStudioFlowDraftSetRoutePlaces(claimed, "none")).toBe(true);
    expect(claimed).not.toHaveProperty("places");
    expect(automationStudioFlowDraftSetRoutePlaces(claimed, "none")).toBe(false);
  });
});
