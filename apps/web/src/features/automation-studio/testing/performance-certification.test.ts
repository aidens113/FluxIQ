import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_CERTIFICATION_PROFILES, AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS, AUTOMATION_STUDIO_RENDER_ISOLATION, missingCertificationCoverage } from "./performance-certification";

describe("Automation Studio performance certification matrix", () => {
  it("covers every required profile and named interaction", () => {
    expect(AUTOMATION_STUDIO_CERTIFICATION_PROFILES).toEqual(["empty", "small", "scale"]);
    expect(Object.values(AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS).every((scenario) => scenario.durationMs > 0)).toBe(true);
    expect(Object.keys(AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS)).toEqual(expect.arrayContaining([
      "project.open", "project.close", "project.switch", "hierarchy.rowClick", "hierarchy.folderToggle",
      "view.coldOpen", "view.warmSwitch", "overlay.type", "graph.select", "graph.drag", "graph.save",
      "graph.rightDragSelection", "workspace.resize", "hierarchy.createFlow", "hierarchy.deleteFlow",
      "hierarchy.createFolder", "hierarchy.deleteFolder", "runtime.listOpen", "runtime.runLogOpen",
    ]));
  });

  it("requires request, task, DOM, render, and heap evidence across the matrix", () => {
    const evidence = new Set(Object.values(AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS).flatMap((item) => [...item.evidence]));
    expect([...evidence].sort()).toEqual(["dom", "heap", "longTasks", "renders", "requests"]);
  });

  it("encodes isolation for local hierarchy, overlay, and graph selection work", () => {
    expect(AUTOMATION_STUDIO_RENDER_ISOLATION["hierarchy.folderToggle"]?.forbidden).toContain("AutomationStudioLive");
    expect(AUTOMATION_STUDIO_RENDER_ISOLATION["overlay.type"]?.allowed).toEqual(["AutomationStudioOverlayBoundary"]);
    expect(AUTOMATION_STUDIO_RENDER_ISOLATION["graph.select"]?.forbidden).toContain("AutomationStudioHierarchyBoundary");
  });

  it("reports profile-specific missing evidence deterministically", () => {
    const missing = missingCertificationCoverage({ "project.open": {} }, "empty");
    expect(missing).not.toContain("project.open");
    expect(missing).toContain("project.close");
    expect(missing).not.toContain("hierarchy.createFlow");
  });
});