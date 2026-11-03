import { describe, expect, it } from "vitest";
import { enteredObservationFixture } from "../../execution-observation/tests/frame.ts";
import { invokeObservedExecutionCallback, observedExecutionProperty } from "../../execution-observation/index.ts";
import { AutomationStudioChannelScope, AutomationStudioEnvironmentClockBindings, AutomationStudioVirtualClock, automationStudioLiveRunEnvironment, automationStudioRunWait, createAutomationStudioScopedRunEnvironment, withinAutomationStudioRunEnvironment } from "../index.ts";

describe("observed environment delegates", () => {
  it("keeps the default forwarding within clear when its real caller accounts the actual child", async () => {
    const f = await enteredObservationFixture();
    let children = 0;
    const child = () => { children++; return 23; };
    f.source.manage({ receiver: undefined, callback: child, contract: "no_direct_effects" });
    await f.run(async observation => {
      const work = async () => await invokeObservedExecutionCallback(observation, { receiver: undefined, callback: child, args: [] });
      expect(await withinAutomationStudioRunEnvironment(automationStudioLiveRunEnvironment, work, observation)).toBe(23);
    });
    expect(children).toBe(1);
    await f.rootPorts.producer.finish(f.reserved.root, f.root.complete(f.origin));
    await f.authority.consumer.release(f.reserved.reservation);
    expect((await f.authority.consumer.inspect(f.scope)).state).toBe("clear");
    // Reopen the same persistence through the same original scope owner.
    const { createExecutionAdmissionAuthority } = await import("../../execution-admission/index.ts");
    const authority = createExecutionAdmissionAuthority({ persistence: f.store, scopes: f.scopes });
    const scope = await authority.openScope(f.scopes.issue());
    expect((await authority.consumer.inspect(scope)).state).toBe("clear");
  });

  it.each(["within", "delay"] as const)("retains a successful unsupported %s call and its original receiver and tuple", async kind => {
    const f = await enteredObservationFixture();
    const signal = new AbortController().signal;
    let acts = 0;
    const work = async () => "original result";
    class Environment {
      #calls = 0;
      async within<T>(...args: [() => Promise<T>]): Promise<T> {
        expect(args).toEqual([work]);
        this.#calls++; acts++;
        return await args[0]();
      }
      async delay(...args: [number, AbortSignal | undefined]): Promise<void> {
        expect(args).toEqual([17, signal]);
        this.#calls++; acts++;
      }
      get calls() { return this.#calls; }
    }
    const custom = new Environment();
    const environment = Object.assign(custom, { kind: "fixture" as const, now: () => 1, random: () => 0.5, newRunId: () => "id", signal });
    await f.run(async observation => {
      if (kind === "within") expect(await withinAutomationStudioRunEnvironment(environment, work, observation)).toBe("original result");
      else await automationStudioRunWait(environment, 17, observation);
    });
    expect(acts).toBe(1);
    expect(custom.calls).toBe(1);
    await f.pending();
    expect(acts).toBe(1);
  });

  it.each(["within", "delay"] as const)("preserves an unsupported %s throw once and refuses a later invocation", async kind => {
    const f = await enteredObservationFixture();
    const original = new Error("execution_observation.durable_frame_missing");
    let acts = 0;
    const callback = async () => { acts++; throw original; };
    const environment = { ...automationStudioLiveRunEnvironment, within: callback, delay: callback };
    await f.run(async observation => {
      const invoke = () => kind === "within"
        ? withinAutomationStudioRunEnvironment(environment, async () => undefined, observation)
        : automationStudioRunWait(environment, 17, observation);
      await expect(invoke()).rejects.toBe(original);
      await expect(invoke()).rejects.toThrow("frame_inactive");
    });
    expect(acts).toBe(1);
    await f.pending();
  });

  it.each(["own", "inherited"] as const)("refuses a %s scoped timer getter before entering work", async placement => {
    const f = await enteredObservationFixture();
    const clock = new AutomationStudioVirtualClock();
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock });
    let reads = 0;
    let acts = 0;
    delete (clock as { startTimer?: unknown }).startTimer;
    const owner = placement === "own" ? clock : Object.create(Object.getPrototypeOf(clock));
    Object.defineProperty(owner, "startTimer", { get() { reads++; return () => { acts++; return { cancel() {} }; }; } });
    if (placement === "inherited") Object.setPrototypeOf(clock, owner);
    await f.run(async observation => {
      await expect(withinAutomationStudioRunEnvironment(environment, async () => { acts++; }, observation)).rejects.toThrow("clock_delegate_unavailable");
    });
    expect(reads).toBe(0);
    expect(acts).toBe(0);
    await f.pending();
  });

  it("retains the exact selected timer through awaited scoped work without reading a replacement getter", async () => {
    const f = await enteredObservationFixture();
    const clock = new AutomationStudioVirtualClock();
    const original = clock.startTimer;
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock, scopeId: "actual.scope" });
    let reads = 0;
    let fired = 0;
    await f.run(async observation => {
      await withinAutomationStudioRunEnvironment(environment, async () => {
        await Promise.resolve();
        Object.defineProperty(clock, "startTimer", { configurable: true, get() { reads++; throw new Error("replacement must not run"); } });
        expect(AutomationStudioChannelScope.current()).toBe("actual.scope");
        const timer = AutomationStudioChannelScope.gatewaySource.timers?.();
        expect(timer).toBe(original);
        timer!({ kind: "answer", commandId: "actual.command" }, 4, () => { fired++; });
        clock.advance(4);
      }, observation);
    });
    expect(reads).toBe(0);
    expect(fired).toBe(1);
    // Factory facts did not certify either the wrapper or its timer callback.
    await f.pending();
  });

  it("checks a captured delay delegate at use while keeping legacy late getter lookup", async () => {
    const f = await enteredObservationFixture();
    const clock = new AutomationStudioVirtualClock();
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock });
    let reads = 0;
    let calls = 0;
    Object.defineProperty(clock, "delay", { get() { reads++; return async function(this: AutomationStudioVirtualClock, ms: number) { expect(this).toBe(clock); expect(ms).toBe(9); calls++; }; } });
    await f.run(async observation => {
      await expect(automationStudioRunWait(environment, 9, observation)).rejects.toThrow("clock_delegate_unavailable");
    });
    expect(reads).toBe(0);
    expect(calls).toBe(0);
    await f.pending();
    await automationStudioRunWait(environment, 9);
    expect(reads).toBe(1);
    expect(calls).toBe(1);
  });

  it("does not let later binding calls replace original deny facts", () => {
    const wrapper = () => 1;
    const clock = { now: () => 1 };
    AutomationStudioEnvironmentClockBindings.bind(wrapper, clock, "now");
    clock.now = () => 2;
    expect(() => AutomationStudioEnvironmentClockBindings.bind(wrapper, clock, "now")).toThrow("clock_binding_already_bound");
    expect(() => AutomationStudioEnvironmentClockBindings.assert(wrapper)).toThrow("clock_delegate_unavailable");
  });

  it("keeps a legacy within getter and the exact original work", async () => {
    let reads = 0;
    const work = async () => 23;
    const environment = { ...automationStudioLiveRunEnvironment };
    Object.defineProperty(environment, "within", { get() { reads++; return function(this: unknown, ...args: [typeof work]) { expect(this).toBe(environment); expect(args).toEqual([work]); return args[0](); }; } });
    expect(await withinAutomationStudioRunEnvironment(environment, work)).toBe(23);
    expect(reads).toBe(1);
    expect(observedExecutionProperty(undefined, environment, "within")).toBeTypeOf("function");
  });
});
