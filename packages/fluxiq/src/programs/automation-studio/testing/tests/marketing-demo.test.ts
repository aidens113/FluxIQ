import { describe, expect, it } from "vitest";
import { createAutomationStudioMarketingDemo } from "../marketing-demo.ts";

describe("createAutomationStudioMarketingDemo", () => {
  it("derives a stable learning demo from the Automation Studio fixtures", () => {
    const demo = createAutomationStudioMarketingDemo();

    expect(demo.source).toBe("automation-studio-fixtures");
    expect(demo.recording.recordingId).toBe("recording.demo-open-and-confirm");
    expect(demo.recording.events.map((event) => event.label)).toEqual([
      "state_checkpoint",
      "Open Dialog",
      "state_delta",
      "note.wait-for-ready",
      "Confirm",
      "state_delta",
    ]);
    expect(demo.flow.subflows.map((subflow) => subflow.name)).toEqual(["Primary path", "Dismiss popup"]);
    expect(demo.flow.graph.nodes.map((node) => node.label)).toEqual(["Start", "Open Dialog", "Confirm", "Report ready"]);
    expect(demo.flow.graph.edges).toHaveLength(3);
  });
});