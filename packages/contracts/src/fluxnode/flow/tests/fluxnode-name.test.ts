// FluxNode names and the Flow path each maps to.
import { describe, expect, it } from "vitest";
import { fluxNodeNameSchema, fluxNodeNameToFlowPath, isFluxNodeName, parseFlowPath } from "../index.ts";

describe("FluxNode names", () => {
  it("accepts dotted lowercase names and maps dots to folders", () => {
    expect(isFluxNodeName("market.cheapest-listings")).toBe(true);
    expect(fluxNodeNameToFlowPath("market.cheapest-listings")).toBe("nodes/market/cheapest-listings");
    expect(fluxNodeNameToFlowPath("solo")).toBe("nodes/solo");
  });

  it("refuses capitals, empty parts, slashes and too many parts", () => {
    for (const bad of ["Market.x", "market..x", ".x", "x.", "a/b", "a b", "", "a.b.c.d.e.f.g.h", "a.b.c.d.e.f.g.h.i", `${"a".repeat(129)}`]) {
      expect(isFluxNodeName(bad), bad).toBe(false);
    }
    expect(() => fluxNodeNameToFlowPath("Bad")).toThrow(TypeError);
  });

  it("maps every valid name to a valid Flow path", () => {
    for (const name of ["a", "a.b", "a_b.c-d.e1", "a.b.c.d.e.f.g"]) expect(parseFlowPath(fluxNodeNameToFlowPath(name)).ok, name).toBe(true);
  });

  it("works as a zod schema", () => {
    expect(fluxNodeNameSchema.safeParse("a.b").success).toBe(true);
    expect(fluxNodeNameSchema.safeParse("A.b").success).toBe(false);
  });
});
