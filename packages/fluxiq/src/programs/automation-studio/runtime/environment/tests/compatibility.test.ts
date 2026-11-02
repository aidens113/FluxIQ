import { describe, expect, it } from "vitest";
import * as legacy from "../index.ts";
import * as environment from "../../../../../runtime/environment/index.ts";
import { automationStudioEnvironmentExecutorOptions } from "../../../../../engine/automation/environment/index.ts";
import { automationStudioRunWait } from "../../../../../engine/automation/pacing/index.ts";

describe("the Studio environment compatibility surface", () => {
  it("exports the canonical implementations and engine adapter without wrappers", () => {
    expect(legacy.AutomationStudioChannelScope).toBe(environment.AutomationStudioChannelScope);
    expect(legacy.AutomationStudioVirtualClock).toBe(environment.AutomationStudioVirtualClock);
    expect(legacy.automationStudioLiveRunEnvironment).toBe(environment.automationStudioLiveRunEnvironment);
    expect(legacy.createAutomationStudioScopedRunEnvironment).toBe(environment.createAutomationStudioScopedRunEnvironment);
    expect(legacy.automationStudioEnvironmentExecutorOptions).toBe(automationStudioEnvironmentExecutorOptions);
    expect(automationStudioRunWait).toBe(environment.automationStudioRunWait);
  });

  it("reads the same async scope in both directions across the compatibility surface", async () => {
    await environment.AutomationStudioChannelScope.run("canonical.scope", async () => {
      await Promise.resolve();
      expect(legacy.AutomationStudioChannelScope.current()).toBe("canonical.scope");
    });
    await legacy.AutomationStudioChannelScope.run("legacy.scope", async () => {
      await Promise.resolve();
      expect(environment.AutomationStudioChannelScope.current()).toBe("legacy.scope");
    });
    expect(legacy.AutomationStudioChannelScope.gatewaySource).toBe(environment.AutomationStudioChannelScope.gatewaySource);
    expect(environment.AutomationStudioChannelScope.current()).toBeUndefined();
  });
});
