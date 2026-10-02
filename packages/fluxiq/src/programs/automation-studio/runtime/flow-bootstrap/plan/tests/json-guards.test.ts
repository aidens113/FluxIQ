// What counts as a bounded JSON value reaching Flow Bootstrap.
//
// Live run 38 (`run-muqilf9s-c3211328`, cause C1): a list read shows its first
// rows as the very objects its records hold. The loop's copy of this check kept
// every object it had passed in `seen`, read the second path to a row as a
// cycle, and refused every read that returned rows. This copy had the same
// defect; an object reached twice is not a cycle, only one inside itself is.
import { describe, expect, it } from "vitest";
import { isJsonObject, isJsonValue } from "../json-guards.ts";

describe("a bounded JSON value", () => {
  it("is one when the same object is reached by two paths", () => {
    const row = { name: "Amara Osei", mutual: "23 mutual friends" };
    const read = { extracted: [row, { name: "Tom Becker" }], firstRows: [row] };

    expect(isJsonValue(read)).toBe(true);
    expect(isJsonObject({ read, again: read })).toBe(true);
  });

  it("is not one when an object holds itself, however deep", () => {
    const outer: Record<string, unknown> = { ok: true };
    outer.inner = { list: [outer] };
    const looped: unknown[] = [];
    looped.push(looped);

    expect(isJsonValue(outer)).toBe(false);
    expect(isJsonValue(looped)).toBe(false);
  });

  it("still holds its bounds: depth, width and finite numbers", () => {
    let deep: unknown = "leaf";
    for (let level = 0; level < 14; level += 1) deep = { deeper: deep };

    expect(isJsonValue(deep)).toBe(false);
    expect(isJsonValue(Array.from({ length: 257 }, () => 1))).toBe(false);
    expect(isJsonValue({ price: Number.NaN })).toBe(false);
  });
});
