import { describe, expect, it } from "vitest";
import type { AutomationStudioHostRuntimeBoundary } from "../../index.ts";
import type { ExecutionCallbackObservation } from "../../../execution-observation/index.ts";
import { enteredObservationFixture } from "../../../execution-observation/tests/frame.ts";
import { automationStudioCompareRouteSignatures, automationStudioRouteEffectHolds, automationStudioRouteEffectSeen, automationStudioSignRouteEffect, automationStudioSignRouteState, observeAutomationStudioRouteState } from "../index.ts";

const before = { state: "before" };
const after = { state: "after" };
const effect = { effect: "recorded" };
const cases: Array<{ key: keyof AutomationStudioHostRuntimeBoundary; args: unknown[]; reply: unknown; invoke(host: AutomationStudioHostRuntimeBoundary, observation?: ExecutionCallbackObservation): unknown }> = [
  { key: "observeRouteState", args: [{ projectId: "project", flowId: "flow" }], reply: after, invoke: (host, observation) => observeAutomationStudioRouteState({ hostRuntime: host, projectId: "project", flowId: "flow" }, observation) },
  { key: "signRouteState", args: [before], reply: before, invoke: (host, observation) => automationStudioSignRouteState(host, before, observation) },
  { key: "compareRouteSignatures", args: [before, after], reply: { matches: true, closeness: 1 }, invoke: (host, observation) => automationStudioCompareRouteSignatures(host, before, after, observation) },
  { key: "signRouteEffect", args: [before, after], reply: effect, invoke: (host, observation) => automationStudioSignRouteEffect(host, before, after, observation) },
  { key: "routeEffectHolds", args: [effect, after], reply: true, invoke: (host, observation) => automationStudioRouteEffectHolds(host, effect, after, observation) },
  { key: "routeEffectSeen", args: [effect, after], reply: "seen", invoke: (host, observation) => automationStudioRouteEffectSeen(host, effect, after, observation) }
];

describe.each(cases)("$key original host adapter", entry => {
  it.each(["own", "inherited"] as const)("fences a caught %s callback getter installed after admission", async placement => {
    const f = await enteredObservationFixture();
    let reads = 0;
    await f.run(async observation => {
      const owner = { capabilities: [] };
      Object.defineProperty(owner, entry.key, { get() {
        reads++;
        return () => entry.reply;
      } });
      const host: AutomationStudioHostRuntimeBoundary = placement === "own" ? owner : Object.create(owner);
      await expect(Promise.resolve().then(() => entry.invoke(host, observation))).rejects.toThrow("callback_accessor_unsupported");
    });
    expect(reads).toBe(0);
    await f.pending();
  });

  it("retains the original private receiver, callback and tuple", async () => {
    const f = await enteredObservationFixture();
    class Host {
      readonly capabilities = [];
      #calls = 0;
      get calls() { return this.#calls; }
      callback(...args: unknown[]) {
        this.#calls++;
        expect(args).toEqual(entry.args);
        return entry.reply;
      }
    }
    const host = new Host();
    Object.defineProperty(Host.prototype, entry.key, { value: Host.prototype.callback });
    f.source.manage({ receiver: host, callback: host.callback, contract: "no_direct_effects" });
    await f.run(async observation => { await entry.invoke(host, observation); });
    expect(host.calls).toBe(1);
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
  });

  it("keeps an unobserved getter and missing-method behavior", async () => {
    let reads = 0;
    let calls = 0;
    const host: AutomationStudioHostRuntimeBoundary = { capabilities: [] };
    Object.defineProperty(host, entry.key, { get() {
      reads++;
      return function (this: AutomationStudioHostRuntimeBoundary, ...args: unknown[]) {
        expect(this).toBe(host);
        expect(args).toEqual(entry.args);
        calls++;
        return entry.reply;
      };
    } });
    await entry.invoke(host);
    expect(reads).toBe(1);
    expect(calls).toBe(1);
    await expect(Promise.resolve(entry.invoke({ capabilities: [] }))).resolves.toBeDefined();
  });
});
