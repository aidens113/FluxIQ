import { describe, expect, it } from "vitest";
import { NativeClock } from "../index.ts";

describe("native clock identities", () => {
  it("reads the ordinary original native clock and random source", () => {
    const before = Date.now();
    expect(NativeClock.now()).toBeGreaterThanOrEqual(before);
    expect(NativeClock.random()).toBeGreaterThanOrEqual(0);
    expect(NativeClock.random()).toBeLessThan(1);
  });

  for (const operation of ["now", "random"] as const) {
    it.each(["data", "accessor"] as const)(`refuses a replaced ${operation} %s method without invoking it`, placement => {
      const container = operation === "now" ? Date : Math;
      const descriptor = Object.getOwnPropertyDescriptor(container, operation);
      if (!descriptor) throw new Error("test.native_clock_missing");
      let calls = 0;
      let available: boolean | undefined;
      let failure: unknown;
      const replacement = () => {
        calls++;
        return 7;
      };
      try {
        Object.defineProperty(container, operation, placement === "data" ? { configurable: true, value: replacement } : { configurable: true, get: replacement });
        available = NativeClock.available(operation);
        try {
          NativeClock[operation]();
        } catch (error) {
          failure = error;
        }
      } finally {
        Object.defineProperty(container, operation, descriptor);
      }
      expect(available).toBe(false);
      expect(failure).toEqual(new Error("native_clock.identity_unavailable"));
      expect(calls).toBe(0);
    });

    it.each(["data", "accessor"] as const)(`refuses a replaced ${operation} %s container without reading it`, placement => {
      const key = operation === "now" ? "Date" : "Math";
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
      if (!descriptor) throw new Error("test.native_container_missing");
      let reads = 0;
      let available: boolean | undefined;
      let failure: unknown;
      try {
        Object.defineProperty(globalThis, key, placement === "data" ? { configurable: true, value: {} } : { configurable: true, get() {
          reads++;
          return {};
        } });
        available = NativeClock.available(operation);
        try {
          NativeClock[operation]();
        } catch (error) {
          failure = error;
        }
      } finally {
        Object.defineProperty(globalThis, key, descriptor);
      }
      expect(available).toBe(false);
      expect(failure).toEqual(new Error("native_clock.identity_unavailable"));
      expect(reads).toBe(0);
    });
  }
});
