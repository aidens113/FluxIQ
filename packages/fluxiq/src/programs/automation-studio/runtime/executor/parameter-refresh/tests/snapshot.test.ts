import { describe, expect, it } from "vitest";
import { automationStudioRefreshSnapshot } from "../snapshot.ts";
import { automationStudioRefreshScope } from "../scope.ts";
import { refresh } from "../../unbound-reacquire/tests/fixtures.ts";

describe("isolated bounded identity data", () => {
  it("copies and freezes nested ordinary JSON without keeping aliases", () => {
    const original = { target: { fields: ["stable", { id: 17 }] } };
    const copied = automationStudioRefreshSnapshot(original);
    expect(copied.kind).toBe("copied");
    if (copied.kind !== "copied") throw new Error("Expected JSON snapshot.");
    expect(copied.value).toEqual(original);
    expect(copied.value).not.toBe(original);
    expect(Object.isFrozen(copied.value)).toBe(true);
    original.target.fields.push("later");
    expect(copied.value).not.toEqual(original);
  });

  it("rejects accessors/cycles/non-JSON and distinguishes reflection failures", () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "identity", { enumerable: true, get: () => {
      getterCalls++;
      return "private";
    } });
    expect(automationStudioRefreshSnapshot(accessor)).toEqual({ kind: "rejected" });
    expect(getterCalls).toBe(0);
    const cycle: { target?: unknown } = {};
    cycle.target = cycle;
    for (const input of [cycle, Number.NaN, [undefined], { target: () => undefined }]) expect(automationStudioRefreshSnapshot(input)).toEqual({ kind: "rejected" });
    expect(automationStudioRefreshSnapshot(new Proxy({}, { ownKeys: () => { throw new Error("unreadable details"); } }))).toEqual({ kind: "unreadable" });
  });

  it("rejects duplicate or expanding target declarations before a host can use them", () => {
    expect(automationStudioRefreshScope({ kind: "declared", refresh })).toEqual({ kind: "declared", refresh });
    for (const invalid of [
      { ...refresh, parameterIds: ["selector", "selector"] },
      { ...refresh, removableParameterIds: ["note"] },
      { ...refresh, container: "arbitrary.path" },
      { ...refresh, parameterIds: ["__proto__"] }
    ]) expect(automationStudioRefreshScope({ kind: "declared", refresh: invalid })).toEqual({ kind: "rejected", reason: "invalid_declaration" });
  });
});
