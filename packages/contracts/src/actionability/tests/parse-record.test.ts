import { describe, expect, it, vi } from "vitest";
import {
  parseAutomationStudioTargetActionabilityRecord,
  type AutomationStudioTargetActionabilityRecord
} from "../../automation-studio.ts";

describe("parseAutomationStudioTargetActionabilityRecord", () => {
  const records: AutomationStudioTargetActionabilityRecord[] = [
    { actionable: true },
    { actionable: false, cause: "hidden" },
    { actionable: false, cause: "disabled" },
    { actionable: false, cause: "covered" }
  ];

  it.each(records)("accepts and copies the exact branch %j", (record) => {
    const original = Object.freeze(record);
    const parsed = parseAutomationStudioTargetActionabilityRecord(original);
    expect(parsed).toEqual(original);
    expect(parsed).not.toBe(original);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Reflect.ownKeys(parsed!)).toEqual(Reflect.ownKeys(original));
    expect(parseAutomationStudioTargetActionabilityRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it("accepts null-prototype data and leaves the input untouched", () => {
    const record = Object.assign(Object.create(null), { actionable: false, cause: "disabled" });
    const before = Object.getOwnPropertyDescriptors(record);
    const parsed = parseAutomationStudioTargetActionabilityRecord(record);
    expect(parsed).toEqual({ actionable: false, cause: "disabled" });
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptors(record)).toEqual(before);
    expect(Object.getPrototypeOf(record)).toBeNull();
  });

  it.each([
    undefined, null, false, true, 0, "true", [], [{ actionable: true }], {},
    { actionable: 1 }, { actionable: "false", cause: "hidden" },
    { actionable: true, cause: undefined }, { actionable: true, cause: "covered" },
    { actionable: false }, { actionable: false, cause: undefined },
    { actionable: false, cause: null }, { actionable: false, cause: "unknown" },
    { actionable: false, cause: "HIDDEN" }, { actionable: false, cause: {} },
    { actionable: true, effect: "unacted" }, { actionable: true, transient: true }
  ])("leaves malformed or inconsistent data unknown: %j", (value) => {
    expect(parseAutomationStudioTargetActionabilityRecord(value)).toBeUndefined();
  });

  it("rejects every private extra field, including nonenumerable and symbol keys", () => {
    for (const key of ["geometry", "text", "dom", "handle", "stage", "effect", "transient"]) {
      const value = { actionable: false, cause: "covered", [key]: "PRIVATE_TARGET_MARKER" };
      expect(parseAutomationStudioTargetActionabilityRecord(value)).toBeUndefined();
      expect(value[key]).toBe("PRIVATE_TARGET_MARKER");
    }
    const hidden = Object.defineProperty({ actionable: true }, "text", { value: "PRIVATE_TARGET_MARKER" });
    const symbol = { actionable: true, [Symbol("private")]: "PRIVATE_TARGET_MARKER" };
    expect(parseAutomationStudioTargetActionabilityRecord(hidden)).toBeUndefined();
    expect(parseAutomationStudioTargetActionabilityRecord(symbol)).toBeUndefined();
  });

  it("rejects nonplain objects and inherited schema fields", () => {
    class Target { actionable = true; }
    const inherited = Object.create({ actionable: false, cause: "covered" });
    const values = [new Target(), new Date(), new Map(), () => ({ actionable: true }), inherited];
    for (const value of values) expect(parseAutomationStudioTargetActionabilityRecord(value)).toBeUndefined();
  });

  it("rejects accessor schema fields without invoking any getter", () => {
    const getter = vi.fn(() => { throw new Error("PRIVATE_ACCESSOR_MARKER"); });
    const values = [
      Object.defineProperty({}, "actionable", { enumerable: true, get: getter }),
      Object.defineProperty({ actionable: false }, "cause", { enumerable: true, get: getter }),
      Object.defineProperty({ actionable: true }, "cause", { get: getter }),
      Object.defineProperty({ actionable: true }, "text", { enumerable: true, get: getter })
    ];
    for (const value of values) expect(parseAutomationStudioTargetActionabilityRecord(value)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
  });

  it("contains hostile reflection failures without reading values or mutating the target", () => {
    const fail = () => { throw new Error("PRIVATE_REFLECTION_MARKER"); };
    const target = Object.freeze({ actionable: true });
    const revoked = Proxy.revocable(target, {});
    revoked.revoke();
    const values = [
      new Proxy(target, { getPrototypeOf: fail }),
      new Proxy(target, { ownKeys: fail }),
      new Proxy(target, { getOwnPropertyDescriptor: fail }),
      revoked.proxy
    ];
    for (const value of values) expect(parseAutomationStudioTargetActionabilityRecord(value)).toBeUndefined();
    const get = vi.fn(fail);
    expect(parseAutomationStudioTargetActionabilityRecord(new Proxy(target, { get }))).toEqual({ actionable: true });
    expect(get).not.toHaveBeenCalled();
    expect(target).toEqual({ actionable: true });
  });
});
