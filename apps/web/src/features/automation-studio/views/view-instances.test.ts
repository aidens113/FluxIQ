import { describe, expect, it } from "vitest";
import { createAutomationStudioViewInstances } from "./view-instances";
import { automationStudioViewId, automationStudioViewIds } from "./view-registry";
import { viewTitle } from "../workspace/components/view-metadata";

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

  it("materializes independent instances of one inner view with object-specific titles", () => {
    const parent = "flow-instructions::object::flow.parent";
    const child = "flow-instructions::object::flow.child";
    const instances = createAutomationStudioViewInstances({
      [parent]: "Instructions: Parent Flow",
      [child]: "Instructions: Child Subflow"
    }, [parent, child]);
    expect(instances.filter((instance) => instance.type === "instructions").map((instance) => [instance.id, instance.label])).toEqual([
      [automationStudioViewId.instructions, "Instructions"],
      [parent, "Instructions: Parent Flow"],
      [child, "Instructions: Child Subflow"]
    ]);
    expect(viewTitle(instances.find((instance) => instance.id === child)!)).toBe("Instructions: Child Subflow");
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
