import { describe, expect, it } from "vitest";
import { automationStudioEnvironmentExecutorOptions } from "../index.ts";
import { AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment, automationStudioLiveRunEnvironment } from "../../../../runtime/environment/index.ts";

describe("the engine timer environment adapter", () => {
  it("set the executor's region timer from an offline environment; the live environment leaves it unset", () => {
    const clock = new AutomationStudioVirtualClock(0);
    const environment = createAutomationStudioScopedRunEnvironment({ kind: "trace", clock });
    expect(automationStudioEnvironmentExecutorOptions({ inputs: {} }, environment).startTimer).toBe(clock.startTimer);

    expect(automationStudioLiveRunEnvironment.startTimer).toBeUndefined();
    expect("startTimer" in automationStudioEnvironmentExecutorOptions({ inputs: {} }, automationStudioLiveRunEnvironment)).toBe(false);
    const own = () => ({ cancel: () => undefined });
    expect(automationStudioEnvironmentExecutorOptions({ inputs: {}, startTimer: own }, automationStudioLiveRunEnvironment).startTimer).toBe(own);
  });

  it("retains the original general clock owner without widening the existing region timer", () => {
    const kinds: string[] = [];
    class Environment {
      readonly kind = "live" as const;
      readonly delay = automationStudioLiveRunEnvironment.delay;
      readonly random = automationStudioLiveRunEnvironment.random;
      readonly newRunId = automationStudioLiveRunEnvironment.newRunId;
      readonly within = automationStudioLiveRunEnvironment.within;
      #time = 42;
      now(): number { return this.#time; }
      startTimer(wait: { readonly kind: string }, _delay: number, fire: () => void) {
        expect(this.#time).toBe(42);
        kinds.push(wait.kind);
        fire();
        return { cancel() {} };
      }
    }
    const environment = new Environment();
    const region = (wait: { readonly kind: "region_timeout" }) => {
      kinds.push(wait.kind);
      return { cancel() {} };
    };
    const applied = automationStudioEnvironmentExecutorOptions({ startTimer: region }, environment);
    expect(applied.clock).toBe(environment);
    expect(applied.clock?.now()).toBe(42);
    let fired = false;
    applied.clock?.startTimer?.({ kind: "exploration_deadline" }, 1, () => { fired = true; });
    applied.startTimer?.({ kind: "region_timeout" }, 1, () => undefined);
    expect(fired).toBe(true);
    expect(applied.startTimer).toBe(region);
    expect(kinds).toEqual(["exploration_deadline", "region_timeout"]);
  });
});
