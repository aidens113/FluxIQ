import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RENDER_BOUNDARIES } from "../development/render-certification";

const sources = new Map([
  ["AutomationStudioLive", "../live/AutomationStudioComposition.tsx"],
  ["AutomationStudioWorkspaceBoundary", "../workspace/render-store.tsx"],
  ["AutomationStudioHierarchyBoundary", "../hierarchy/ProjectTree.tsx"],
  ["AutomationStudioPaneBoundary", "../workspace/components/view-container.tsx"],
  ["AutomationStudioOverlayBoundary", "../workspace/studio-ui-store.tsx"],
  ["AutomationStudioSelectionBoundary", "../inspector/InspectorPanel.tsx"],
]);

describe("Automation Studio render boundary source contract", () => {
  it("keeps every certification boundary independently instrumented", () => {
    expect([...sources.keys()]).toEqual([...AUTOMATION_STUDIO_RENDER_BOUNDARIES]);
    for (const [boundary, relativePath] of sources) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source, boundary).toContain("useUiRenderMetric(\"" + boundary + "\")");
    }
  });

  it("does not collapse scoped boundaries into the composition root", () => {
    const root = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    for (const boundary of AUTOMATION_STUDIO_RENDER_BOUNDARIES.slice(1)) {
      expect(root).not.toContain("useUiRenderMetric(\"" + boundary + "\")");
    }
  });
});
