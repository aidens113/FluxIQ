import { describe, expect, it } from "vitest";
import { executionDataProperty, observedExecutionProperty } from "../index.ts";
import { enteredObservationFixture } from "./frame.ts";

describe("the original observation's descriptor read", () => {
  it.each(["own", "inherited", "revoked"] as const)("refuses a %s Proxy without invoking reflection traps", async placement => {
    const f = await enteredObservationFixture();
    let traps = 0;
    const wrapped = Proxy.revocable({ callback: () => "must not run" }, {
      getOwnPropertyDescriptor() { traps++; throw new Error("descriptor trap ran"); },
      getPrototypeOf() { traps++; throw new Error("prototype trap ran"); }
    });
    const receiver = placement === "inherited" ? Object.create(wrapped.proxy) : wrapped.proxy;
    if (placement === "revoked") wrapped.revoke();
    await f.run(async observation => {
      expect(() => observedExecutionProperty(observation, receiver, "callback")).toThrow("callback_proxy_unsupported");
    });
    expect(traps).toBe(0);
    await f.pending();
  });

  it("keeps an unobserved Proxy's original get trap and receiver", () => {
    let reads = 0;
    const callback = () => "original";
    const original = new Proxy({ callback }, { get(target, key, receiver) { reads++; expect(receiver).toBe(original); return Reflect.get(target, key, receiver); } });
    expect(observedExecutionProperty(undefined, original, "callback")).toBe(callback);
    expect(reads).toBe(1);
  });

  it.each(["own", "inherited"] as const)("fences a caught %s callback accessor without invoking it", async placement => {
    const f = await enteredObservationFixture();
    let reads = 0;
    await f.run(async observation => {
      const owner = { callback: () => "original" };
      const receiver = placement === "own" ? owner : Object.create(owner);
      Object.defineProperty(owner, "callback", { configurable: true, get() {
        reads++;
        return () => "must not run";
      } });
      expect(() => observedExecutionProperty(observation, receiver, "callback")).toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    expect([...f.store.rows.values()].some(row => row.facts.some(fact => fact.kind === "terminal_unknown"))).toBe(true);
    await f.pending();
  });

  it("returns inherited data methods unchanged and retains direct legacy getter semantics", () => {
    class Owner {
      #value = "original";
      callback() { return this.#value; }
    }
    const receiver = new Owner();
    expect(executionDataProperty(receiver, "callback")).toBe(receiver.callback);
    expect(executionDataProperty(receiver, "callback").call(receiver)).toBe("original");
    let reads = 0;
    const legacy = { get callback() {
      reads++;
      return receiver.callback;
    } };
    expect(observedExecutionProperty(undefined, legacy, "callback")).toBe(receiver.callback);
    expect(reads).toBe(1);
    expect(executionDataProperty(receiver, Symbol("missing"))).toBeUndefined();
  });
});
