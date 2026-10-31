import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioRouteSituationDelta } from "../delta.ts";
import { automationStudioScreenRouteSituation } from "../screen-situation.ts";

describe("screened route situation deltas", () => {
  it("reconstructs baseline, unchanged, nested and array updates, null and removals", () => {
    // These are already flattened keys: the delta never reinterprets a path.
    const states: JsonObject[] = [
      { "state.value": 1, "state.nested": { z: 2, a: 1 }, "state.list": [1, 2], "state.null": null },
      { "state.null": null, "state.list": [1, 2], "state.nested": { a: 1, z: 2 }, "state.value": 1 },
      { "state.value": 2, "state.nested": { z: 2, a: 1 }, "state.list": [1, 2], "state.null": null },
      { "state.value": 2, "state.nested": { z: 3, a: 1 }, "state.list": [2, 1], "state.null": null },
      { "state.value": null, "state.nested": { z: 3, a: 1 }, "state.list": [2, 1] },
      { "state.nested": { z: 3, a: 1 }, "state.list": [2, 1] }
    ];
    let reconstructed: JsonObject = {};
    const projected = states.map((state, index) => {
      const value = automationStudioRouteSituationDelta({ seen: `s${index}`, state, ...(index ? { prior: { callId: `s${index - 1}`, state: states[index - 1]! } } : {}) });
      if (index === 0) reconstructed = { ...(value.state as JsonObject) };
      else {
        expect(value.baseSituation).toBe(`s${index - 1}`);
        for (const key of value.removed as string[]) delete reconstructed[key];
        Object.assign(reconstructed, value.updates);
      }
      expect(reconstructed).toEqual(state);
      return value;
    });
    expect(projected[1]).toMatchObject({ updates: {}, removed: [] });
    expect(projected[2]).toMatchObject({ updates: { "state.value": 2 }, removed: [] });
    expect(projected[3]).toMatchObject({ updates: { "state.nested": { a: 1, z: 3 }, "state.list": [2, 1] } });
    expect(projected[4]).toMatchObject({ updates: { "state.value": null }, removed: ["state.null"] });
    expect(projected[5]).toMatchObject({ updates: {}, removed: ["state.value"] });
  });

  it("removes a previously visible value when screening withholds its successor", () => {
    const prior = automationStudioScreenRouteSituation({ "state.value": "public" }, []);
    const state = automationStudioScreenRouteSituation({ "state.value": "sk-abcdefghijklmnopqrstuvwxyz0123456789" }, []);
    const value = automationStudioRouteSituationDelta({ seen: "changed", state, prior: { callId: "core.route_state.8", state: prior } });
    expect(value).toEqual({ seen: "changed", baseSituation: "core.route_state.8", updates: {}, removed: ["state.value"] });
    expect(JSON.stringify(value)).not.toContain("sk-");
  });

  it("snapshots values and deterministically orders object keys without changing arrays", () => {
    const state: JsonObject = { z: { y: 2, a: 1 }, a: [2, 1] };
    const first = automationStudioRouteSituationDelta({ seen: "first", state });
    const same = automationStudioRouteSituationDelta({ seen: "first", state: { a: [2, 1], z: { a: 1, y: 2 } } });
    expect(JSON.stringify(first)).toBe(JSON.stringify(same));
    (state.z as JsonObject).a = 5;
    expect(first.state).toEqual({ a: [2, 1], z: { a: 1, y: 2 } });
  });

  it("refuses unreadable comparisons instead of treating them as unchanged", () => {
    const cyclic: JsonObject = {};
    cyclic.self = cyclic;
    expect(() => automationStudioRouteSituationDelta({ seen: "changed", state: { key: 1 }, prior: { callId: "prior", state: { key: cyclic } } }))
      .toThrow("The routing situation could not be compared for evidence.");
  });
});
