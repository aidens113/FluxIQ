import { describe, expect, it } from "vitest";
import * as nodes from "../../../../components/automation/index.ts";
import * as studioNodes from "../index.ts";
import * as studioMath from "../math/index.ts";

describe("Studio node compatibility facades", () => {
  it("exposes the canonical singleton values and the retained Studio SDK", () => {
    for (const key of Object.keys(nodes) as Array<keyof typeof nodes>) {
      expect(studioNodes[key], key).toBe(nodes[key]);
    }
    const sdkValues = [
      "AUTOMATION_STUDIO_IMPORTER_SDK_VERSION",
      "AutomationStudioImporterSdkRegistry",
      "validateAutomationStudioImporterSdkManifest"
    ];
    expect(Object.keys(studioNodes).sort()).toEqual([...Object.keys(nodes), ...sdkValues].sort());
    expect(Object.keys(nodes)).not.toContain("AutomationStudioImporterSdkRegistry");
  });

  it("keeps legacy feature-barrel exports narrow", () => {
    expect(Object.keys(studioMath)).toEqual(["mathNodes"]);
    expect(studioMath.mathNodes.every((node) => studioNodes.getAutomationNodeDefinition(node.id) === node)).toBe(true);
  });
});
