import { describe, expect, it } from "vitest";
import { AutomationStudioInputUseCapture as Capture } from "../index.ts";

describe("exact runtime-safe input-use capture", () => {
  it("copies full JSON without projecting handles, evidence, defaults or false values", () => {
    const original = { item: { handle: "synthetic-handle", evidence: { id: "synthetic-evidence" }, $minted: 0, plain: false }, list: [null, 0, false, ""], defaults: {} };
    const captured = Capture.object(original);
    expect(captured.status).toBe("valid");
    if (captured.status !== "valid") throw new Error("expected valid capture");
    expect(captured.value).toEqual(original);
    original.item.handle = "changed";
    expect(captured.value.item.handle).toBe("synthetic-handle");
    expect(Object.isFrozen(captured.value.item)).toBe(true);
    expect(Object.isFrozen(original.item)).toBe(false);
  });

  it("rejects getters without invoking them", () => {
    let reads = 0;
    const value = { nested: Object.defineProperty({}, "secret", { enumerable: true, get() {
      reads += 1;
      return "synthetic-secret";
    } }) };
    expect(Capture.object(value)).toEqual({ status: "invalid" });
    expect(reads).toBe(0);
  });

  it.each([
    ["proxy", () => ({ item: new Proxy({ value: 1 }, {}) })],
    ["undefined member", () => ({ value: undefined })],
    ["sparse array", () => ({ list: new Array(2) })],
    ["negative zero", () => ({ value: -0 })],
    ["nonfinite", () => ({ value: Infinity })],
    ["bigint", () => ({ value: 1n })],
    ["special object", () => ({ value: new Date(0) })],
    ["function", () => ({ value: () => 1 })],
    ["symbol key", () => ({ [Symbol("synthetic")]: 1 })],
    ["hidden key", () => Object.defineProperty({}, "value", { value: 1, enumerable: false })],
    ["null prototype", () => Object.assign(Object.create(null), { value: 1 })],
    ["array extra field", () => ({ list: Object.assign([1], { other: 2 }) })],
    ["cycle", () => {
      const value: { cycle?: object } = {};
      value.cycle = value;
      return value;
    }]
  ] as const)("refuses %s instead of normalizing it", (_name, create) => {
    expect(Capture.object(create())).toEqual({ status: "invalid" });
  });

  it("preserves absent versus null, array order and every nested supported field", () => {
    expect(Capture.same({}, { value: null })).toBe(false);
    expect(Capture.same({ value: [1, 2] }, { value: [2, 1] })).toBe(false);
    expect(Capture.same({ item: { handle: "one" } }, { item: { handle: "two" } })).toBe(false);
    expect(Capture.same({ left: 1, right: 2 }, { right: 2, left: 1 })).toBe(true);
  });
});
