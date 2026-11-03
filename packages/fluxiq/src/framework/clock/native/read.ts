import { originalNativeClockFunctions as original } from "./functions.ts";

/** Validates the current native delegate without executing a replacement. */
export class NativeClock {
  static available(operation: "now" | "random"): boolean {
    const container = operation === "now" ? original.date : original.math;
    const current = Object.getOwnPropertyDescriptor(globalThis, operation === "now" ? "Date" : "Math");
    if (!current || !("value" in current) || current.value !== container || (typeof container !== "function" && (container === null || typeof container !== "object"))) return false;
    const method = Object.getOwnPropertyDescriptor(container, operation);
    return Boolean(method && "value" in method && method.value === original[operation] && typeof original[operation] === "function");
  }

  static assert(operation: "now" | "random"): void {
    if (!this.available(operation)) throw new Error("native_clock.identity_unavailable");
  }

  static now(): number {
    this.assert("now");
    if (typeof original.now !== "function") throw new Error("native_clock.identity_unavailable");
    const value: unknown = Reflect.apply(original.now, original.date, []);
    if (typeof value !== "number") throw new Error("native_clock.invalid_value");
    return value;
  }

  static random(): number {
    this.assert("random");
    if (typeof original.random !== "function") throw new Error("native_clock.identity_unavailable");
    const value: unknown = Reflect.apply(original.random, original.math, []);
    if (typeof value !== "number") throw new Error("native_clock.invalid_value");
    return value;
  }
}
