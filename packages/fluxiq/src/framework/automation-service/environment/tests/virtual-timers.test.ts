// Virtual timers (traces and offline trials, P4, "Virtual clock"): deadlines
// on the virtual clock fire when time passes them -- through `advance` or a
// `delay` -- in time order, never by themselves; a scoped environment carries
// them in its channel scope and hands them to the executor's options, while
// the live environment leaves both alone.
import { describe, expect, it } from "vitest";
import { AutomationStudioChannelScope, automationStudioEnvironmentExecutorOptions, automationStudioLiveRunEnvironment, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../index.ts";

const WAIT = { kind: "answer" } as const;

describe("AutomationStudioVirtualClock timers", () => {
  it("fire on advance in deadline order, ties in the order they were started, with now at each deadline", () => {
    const clock = new AutomationStudioVirtualClock(1_000);
    const fired: string[] = [];
    clock.startTimer(WAIT, 300, () => fired.push(`c@${clock.now()}`));
    clock.startTimer(WAIT, 100, () => fired.push(`a@${clock.now()}`));
    clock.startTimer(WAIT, 300, () => fired.push(`d@${clock.now()}`));
    clock.startTimer(WAIT, 200, () => fired.push(`b@${clock.now()}`));
    clock.startTimer(WAIT, 900, () => fired.push(`late@${clock.now()}`));

    clock.advance(250);
    expect(fired).toEqual(["a@1100", "b@1200"]);
    expect(clock.now()).toBe(1_250);

    clock.advance(100);
    expect(fired).toEqual(["a@1100", "b@1200", "c@1300", "d@1300"]);
    expect(clock.now()).toBe(1_350);
  });

  it("fires a timer started while firing when its deadline falls within the same advance", () => {
    const clock = new AutomationStudioVirtualClock(0);
    const fired: string[] = [];
    clock.startTimer(WAIT, 10, () => {
      fired.push(`first@${clock.now()}`);
      clock.startTimer(WAIT, 15, () => fired.push(`second@${clock.now()}`));
      clock.startTimer(WAIT, 500, () => fired.push(`beyond@${clock.now()}`));
    });

    clock.advance(30);

    expect(fired).toEqual(["first@10", "second@25"]);
    expect(clock.now()).toBe(30);
  });

  it("fire through delay as time passes them, and a cancelled timer never fires", async () => {
    const clock = new AutomationStudioVirtualClock(0);
    const fired: string[] = [];
    clock.startTimer(WAIT, 50, () => fired.push(`kept@${clock.now()}`));
    const cancelled = clock.startTimer(WAIT, 40, () => fired.push("cancelled"));
    cancelled.cancel();

    await clock.delay(45);
    expect(fired).toEqual([]);
    await clock.delay(10);
    expect(fired).toEqual(["kept@50"]);
    clock.advance(10_000);
    expect(fired).toEqual(["kept@50"]);
  });

  it("never moves by itself: a due-later timer stays unfired across real time, and a cancelled wait fires nothing", async () => {
    const clock = new AutomationStudioVirtualClock(0);
    let fired = 0;
    clock.startTimer(WAIT, 5, () => { fired += 1; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(0);
    expect(clock.now()).toBe(0);

    const controller = new AbortController();
    controller.abort();
    await clock.delay(100, controller.signal);
    expect(fired).toBe(0);
    expect(clock.now()).toBe(0);
  });

  it("treats a zero, negative or non-finite wait as due now, fired the next time the clock is moved", () => {
    const clock = new AutomationStudioVirtualClock(7);
    const fired: number[] = [];
    clock.startTimer(WAIT, 0, () => fired.push(1));
    clock.startTimer(WAIT, -10, () => fired.push(2));
    clock.startTimer(WAIT, Number.NaN, () => fired.push(3));
    expect(fired).toEqual([]);

    clock.advance(0);

    expect(fired).toEqual([1, 2, 3]);
    expect(clock.now()).toBe(7);
  });
});

describe("a scoped environment's timers", () => {
  it("are its clock's, carried in its channel scope for the gateway and absent outside it", async () => {
    const clock = new AutomationStudioVirtualClock(0);
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock, scopeId: "scope.timers" });
    expect(environment.startTimer).toBe(clock.startTimer);
    expect(AutomationStudioChannelScope.gatewaySource.timers?.()).toBeUndefined();

    const seen = await environment.within(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { scopeId: AutomationStudioChannelScope.gatewaySource.current(), timers: AutomationStudioChannelScope.gatewaySource.timers?.() };
    });

    expect(seen).toEqual({ scopeId: "scope.timers", timers: clock.startTimer });
    expect(AutomationStudioChannelScope.gatewaySource.timers?.()).toBeUndefined();
  });

  it("are not carried by a scope entered without them", async () => {
    const timers = await AutomationStudioChannelScope.run("scope.bare", async () => AutomationStudioChannelScope.gatewaySource.timers?.());
    expect(timers).toBeUndefined();
  });

  it("set the executor's region timer from an offline environment; the live environment leaves it unset", () => {
    const clock = new AutomationStudioVirtualClock(0);
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock });
    expect(automationStudioEnvironmentExecutorOptions({ inputs: {} }, environment).startTimer).toBe(clock.startTimer);

    expect(automationStudioLiveRunEnvironment.startTimer).toBeUndefined();
    expect("startTimer" in automationStudioEnvironmentExecutorOptions({ inputs: {} }, automationStudioLiveRunEnvironment)).toBe(false);
    const own = () => ({ cancel: () => undefined });
    expect(automationStudioEnvironmentExecutorOptions({ inputs: {}, startTimer: own }, automationStudioLiveRunEnvironment).startTimer).toBe(own);
  });
});
