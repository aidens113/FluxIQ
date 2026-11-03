import { describe, expect, it } from "vitest";
import { AutomationStudioChannelScope, automationStudioLiveRunEnvironment, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../index.ts";

describe("automationStudioLiveRunEnvironment", () => {
  it("is today's fallbacks: the wall clock, a real wait, live randomness, unique ids and no channel scope", async () => {
    const env = automationStudioLiveRunEnvironment;
    const before = Date.now();
    expect(env.kind).toBe("live");
    expect(env.now()).toBeGreaterThanOrEqual(before);
    const random = env.random();
    expect(random).toBeGreaterThanOrEqual(0);
    expect(random).toBeLessThan(1);
    expect(env.newRunId("trial")).toMatch(/^trial\.[0-9a-f-]{36}$/);
    expect(env.newRunId("trial")).not.toBe(env.newRunId("trial"));
    await expect(env.within(async () => AutomationStudioChannelScope.current())).resolves.toBeUndefined();
    const started = Date.now();
    await env.delay(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });

  it("ends a live wait as soon as its run is cancelled", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const waiting = automationStudioLiveRunEnvironment.delay(60_000, controller.signal);
    controller.abort();
    await waiting;
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("AutomationStudioVirtualClock", () => {
  it("moves only when waited on, and a wait costs no wall time", async () => {
    const clock = new AutomationStudioVirtualClock(1_000);
    const started = Date.now();
    expect(clock.now()).toBe(1_000);
    await clock.delay(3_600_000);
    await clock.delay(-5);
    await clock.delay(Number.NaN);
    expect(clock.now()).toBe(3_601_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("does not advance for a wait whose run was already cancelled", async () => {
    const clock = new AutomationStudioVirtualClock(0);
    const controller = new AbortController();
    controller.abort();
    await clock.delay(500, controller.signal);
    expect(clock.now()).toBe(0);
  });
});

describe("createAutomationStudioScopedRunEnvironment", () => {
  it("runs work inside its own channel scope, read through the gateway source, and leaves it afterwards", async () => {
    const env = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(), scopeId: "scope.env" });
    expect(AutomationStudioChannelScope.gatewaySource.current()).toBeUndefined();
    const seen = await env.within(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return AutomationStudioChannelScope.gatewaySource.current();
    });
    expect(seen).toBe("scope.env");
    expect(AutomationStudioChannelScope.gatewaySource.current()).toBeUndefined();
  });

  it("keeps two environments' scopes apart when their work interleaves", async () => {
    const first = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock: new AutomationStudioVirtualClock() });
    const second = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock: new AutomationStudioVirtualClock() });
    expect(first.scopeId).not.toBe(second.scopeId);
    const read = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return AutomationStudioChannelScope.current();
    };
    await expect(Promise.all([first.within(read), second.within(read)])).resolves.toEqual([first.scopeId, second.scopeId]);
  });

  it("takes time from its virtual clock and its ids and randomness from the caller when given", async () => {
    const clock = new AutomationStudioVirtualClock(50);
    const env = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock, random: () => 0.25, newRunId: (prefix) => `${prefix}.fixed` });
    await env.delay(10);
    expect(env.now()).toBe(60);
    expect(clock.now()).toBe(60);
    expect(env.random()).toBe(0.25);
    expect(env.newRunId("trial")).toBe("trial.fixed");
  });

  it("refuses an empty scope id", () => {
    expect(() => createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(), scopeId: "" })).toThrow("channel_scope.scope_id_required");
  });
});
