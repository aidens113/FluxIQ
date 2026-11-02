import { describe, expect, it } from "vitest";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts/index.ts";
import { automationStudioEnvironmentExecutorOptions } from "../executor-options.ts";
import { automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";
import { createAutomationStudioScopedRunEnvironment } from "../../../../runtime/environment/index.ts";
import { AutomationStudioVirtualClock } from "../../../../runtime/environment/index.ts";

describe("automationStudioEnvironmentExecutorOptions", () => {
  it("takes the live clock and wait, keeps every other option, and leaves randomness unset", () => {
    const signal = new AbortController().signal;
    const options: AutomationStudioGraphExecutionOptions = { inputs: { a: 1 }, signal, maxSteps: 7 };
    const applied = automationStudioEnvironmentExecutorOptions(options, automationStudioLiveRunEnvironment);
    expect(applied.inputs).toEqual({ a: 1 });
    expect(applied.signal).toBe(signal);
    expect(applied.maxSteps).toBe(7);
    expect(applied.now).toBe(automationStudioLiveRunEnvironment.now);
    expect(applied.delay).toBe(automationStudioLiveRunEnvironment.delay);
    // The Wait node reads a missing random as no jitter; the live environment must not add any.
    expect("random" in applied).toBe(false);
  });

  it("keeps a live run's own randomness and takes an offline environment's", () => {
    const own = () => 0.1;
    expect(automationStudioEnvironmentExecutorOptions({ inputs: {}, random: own }, automationStudioLiveRunEnvironment).random).toBe(own);
    const offline = () => 0.25;
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(0), random: offline });
    expect(automationStudioEnvironmentExecutorOptions({ inputs: {}, random: own }, environment).random).toBe(offline);
  });

  it("leaves the options it was given untouched", () => {
    const options: AutomationStudioGraphExecutionOptions = { inputs: {} };
    automationStudioEnvironmentExecutorOptions(options, automationStudioLiveRunEnvironment);
    expect(options).toEqual({ inputs: {} });
  });

  it("reads the original option getters before environment overrides and retains extra own fields", () => {
    const events: string[] = [];
    const extra = Symbol("original extra field");
    const original = Object.freeze({ value: "kept by identity" });
    const options = {
      get maxSteps() {
        events.push("options.maxSteps");
        return 7;
      },
      explicitUndefined: undefined,
      get [extra]() {
        events.push("options.symbol");
        return original;
      }
    };
    const now = () => 42;
    const delay = async () => undefined;
    const environment = {
      ...automationStudioLiveRunEnvironment,
      get now() {
        events.push("environment.now");
        return now;
      },
      get delay() {
        events.push("environment.delay");
        return delay;
      }
    };
    const applied = automationStudioEnvironmentExecutorOptions(options, environment);
    expect(events).toEqual(["options.maxSteps", "options.symbol", "environment.now", "environment.delay"]);
    expect(applied.maxSteps).toBe(7);
    expect(applied.now).toBe(now);
    expect(applied.delay).toBe(delay);
    expect(Object.getOwnPropertyDescriptor(applied, extra)?.value).toBe(original);
    expect(Object.hasOwn(applied, "explicitUndefined")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(options, "maxSteps")?.get).toBeTypeOf("function");
  });

  it("makes an offline run's waits follow its virtual clock, with no wall waiting", async () => {
    const clock = new AutomationStudioVirtualClock(1_000);
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock });
    const applied = automationStudioEnvironmentExecutorOptions({ inputs: {} }, environment);
    const before = Date.now();
    await applied.delay!(60_000);
    expect(applied.now!()).toBe(61_000);
    expect(Date.now() - before).toBeLessThan(1_000);
  });
});
