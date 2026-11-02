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
});
