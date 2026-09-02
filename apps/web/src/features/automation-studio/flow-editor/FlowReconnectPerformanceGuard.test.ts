import { describe, expect, it } from "vitest";
import { scopeNodeLookupValues } from "./FlowReconnectPerformanceGuard";

describe("reconnect performance guard", () => {
  it("limits iteration to reconnect candidates and restores the lookup", () => {
    const first = { id: "first" };
    const second = { id: "second" };
    const third = { id: "third" };
    const lookup = new Map([
      [first.id, first],
      [second.id, second],
      [third.id, third]
    ]);

    const restore = scopeNodeLookupValues(lookup, new Set(["second", "third"]));

    expect([...lookup.values()]).toEqual([second, third]);
    expect(lookup.get("first")).toBe(first);
    restore();
    expect([...lookup.values()]).toEqual([first, second, third]);
  });
});
