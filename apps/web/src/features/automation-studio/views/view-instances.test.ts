import { describe, expect, it } from "vitest";
import { createAutomationStudioViewInstances } from "./view-instances";
import { automationStudioViewId, automationStudioViewIds } from "./view-registry";

describe("createAutomationStudioViewInstances", () => {
  it("creates exactly one instance for every canonical registry entry", () => {
    const instances = createAutomationStudioViewInstances();
    expect(instances.map((instance) => instance.id)).toEqual(automationStudioViewIds);
  });

  it("applies scoped dynamic labels without changing registry metadata", () => {
    const instances = createAutomationStudioViewInstances({
      [automationStudioViewId.flowEditor]: "Flow: Checkout",
      [automationStudioViewId.state]: "State: Submit"
    });
    expect(instances.find((instance) => instance.id === automationStudioViewId.flowEditor)?.label).toBe("Flow: Checkout");
    expect(instances.find((instance) => instance.id === automationStudioViewId.state)?.label).toBe("State: Submit");
    expect(instances.find((instance) => instance.id === automationStudioViewId.runtime)?.label).toBe("Runtime Debug");
  });

  it("marks only live connection and recording surfaces as live", () => {
    const liveIds = createAutomationStudioViewInstances()
      .filter((instance) => instance.state === "live")
      .map((instance) => instance.id);
    expect(liveIds).toEqual([
      automationStudioViewId.clients,
      automationStudioViewId.recordingTimeline
    ]);
  });
});