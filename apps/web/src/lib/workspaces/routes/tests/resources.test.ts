import { describe, expect, it } from "vitest";
import { snapshotRouteResources } from "../resources";

describe("request-owned route resource snapshot", () => {
  it("deep copies and freezes objects and arrays instead of retaining request references", () => {
    const input = { projectId: "project-a", nested: { values: ["recording-a", { id: "target-a" }] } };
    const result = snapshotRouteResources(input);
    if (!result.ok) throw new Error("Expected a resource snapshot");
    const snapshot = result.value;
    expect(snapshot).toEqual(input);
    input.projectId = "project-b";
    input.nested.values.push("changed");
    expect(snapshot).toEqual({ projectId: "project-a", nested: { values: ["recording-a", { id: "target-a" }] } });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.nested)).toBe(true);
    const nested = snapshot?.nested as typeof input.nested;
    expect(Object.isFrozen(nested.values)).toBe(true);
    expect(Object.isFrozen(nested.values[1])).toBe(true);
    expect(() => nested.values.push("forged")).toThrow();
  });

  it.each([{ target: new Map([["id", "target"]]) }, { target: new Date() }, { target: () => "target" }])("refuses unsupported non-data resource values: %j", input => {
      expect(snapshotRouteResources(input)).toMatchObject({ ok: false, error: "Request resources could not be verified." });
  });

  it("refuses cycles while allowing independent repeated plain references", () => {
    const cycle: { target?: unknown } = {};
    cycle.target = cycle;
    expect(snapshotRouteResources(cycle)).toMatchObject({ ok: false });
    const target = { id: "same" };
    expect(snapshotRouteResources({ first: target, second: target })).toEqual({ ok: true, value: { first: target, second: target } });
  });
});
