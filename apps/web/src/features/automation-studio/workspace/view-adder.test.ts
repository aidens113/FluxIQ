import { Blocks } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { AutomationViewInstance } from "../types";
import { automationViewAdderOptions } from "./view-adder";

const views: AutomationViewInstance[] = [
  { id: "policy-primary", label: "Flow", type: "design", icon: Blocks },
  { id: "flow-router", label: "Router", type: "router", icon: Blocks },
  { id: "timeline-recording", label: "Timeline", type: "recordings", icon: Blocks },
  { id: "runtime-debug", label: "Runtime Debug", type: "runtime", icon: Blocks },
  { id: "problems-view", label: "Problems", type: "problems", icon: Blocks },
  { id: "global-inspector", label: "Inspector", type: "inspector", icon: Blocks },
  { id: "proposal-generator", label: "Legacy Proposal Generator", type: "proposal-generator", icon: Blocks }
];

describe("Automation Studio View Adder options", () => {
  it("keeps main and Inspector options in their fixed regions", () => {
    const context = { hasProject: true, hasFlow: true, hasRecording: true, hasSelection: true };
    expect(automationViewAdderOptions(views, "main", context, new Set()).map((item) => item.view.id)).toEqual([
      "policy-primary",
      "flow-router",
      "timeline-recording",
      "runtime-debug"
    ]);
    expect(automationViewAdderOptions(views, "right", context, new Set()).map((item) => item.view.id)).toEqual([
      "problems-view",
      "global-inspector"
    ]);
  });

  it("explains missing context and prevents duplicate singleton views", () => {
    const options = automationViewAdderOptions(
      views,
      "main",
      { hasProject: true, hasFlow: false, hasRecording: false, hasSelection: false },
      new Set(["runtime-debug"])
    );
    expect(options.find((item) => item.view.id === "policy-primary")?.disabledReason).toBe("Select a Flow or subflow first");
    expect(options.find((item) => item.view.id === "timeline-recording")?.disabledReason).toBe("Select a recording first");
    expect(options.find((item) => item.view.id === "runtime-debug")?.disabledReason).toBe("Select a Flow or subflow first");
    const duplicate = automationViewAdderOptions(
      views,
      "main",
      { hasProject: true, hasFlow: true, hasRecording: true, hasSelection: true },
      new Set(["runtime-debug"])
    );
    expect(duplicate.find((item) => item.view.id === "runtime-debug")?.disabledReason).toBe("Already open in this workspace");
  });

  it("omits obsolete and unregistered workspace entries", () => {
    const options = automationViewAdderOptions(
      views,
      "main",
      { hasProject: true, hasFlow: true, hasRecording: true, hasSelection: true },
      new Set()
    );
    expect(options.map((item) => item.view.id)).not.toContain("proposal-generator");
  });
});