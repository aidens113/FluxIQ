// Covers the Flow size setting as the Flow settings read it: merged-metadata.ts
// fills the default, and settings-fingerprint.ts moves the settings revision
// only when the setting says something other than the default.

import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, defaultAutomationStudioFlowSettingsMetadata, type AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { mergedFlowSettingsMetadata } from "../merged-metadata.ts";
import { automationStudioFlowSettingsFingerprint } from "../settings-fingerprint.ts";

function flowWith(metadata: Record<string, unknown>): AutomationStudioFlowArtifact {
  const flow = createBlankAutomationStudioFlowArtifact({ projectId: "project.size", flowId: "flow.size", name: "Sized", now: 1 });
  return { ...flow, metadata: metadata as JsonObject };
}

describe("the Flow size setting in Flow settings", () => {
  it("is written into a new Flow's defaults as 100", () => {
    expect(defaultAutomationStudioFlowSettingsMetadata().flowSizeSettings).toEqual({ maxNodesPerSubflow: 100 });
  });

  it("reads 100 for a Flow that has none, and for one holding a value no save would take", () => {
    expect(mergedFlowSettingsMetadata({}).flowSizeSettings).toEqual({ maxNodesPerSubflow: 100 });
    expect(mergedFlowSettingsMetadata(undefined).flowSizeSettings).toEqual({ maxNodesPerSubflow: 100 });
    expect(mergedFlowSettingsMetadata({ flowSizeSettings: { maxNodesPerSubflow: 0 } }).flowSizeSettings).toEqual({ maxNodesPerSubflow: 100 });
    expect(mergedFlowSettingsMetadata({ flowSizeSettings: "150" }).flowSizeSettings).toEqual({ maxNodesPerSubflow: 100 });
  });

  it("keeps a stored value", () => {
    expect(mergedFlowSettingsMetadata({ flowSizeSettings: { maxNodesPerSubflow: 150 } }).flowSizeSettings).toEqual({ maxNodesPerSubflow: 150 });
  });

  it("leaves the settings revision of a Flow without the setting, and of one at the default, where it was", () => {
    const base = createBlankAutomationStudioFlowArtifact({ projectId: "project.size", flowId: "flow.size", name: "Sized", now: 1 });
    const { flowSizeSettings: _dropped, ...legacy } = base.metadata ?? {};
    const legacyRevision = automationStudioFlowSettingsFingerprint(flowWith(legacy));
    expect(automationStudioFlowSettingsFingerprint(base)).toBe(legacyRevision);
    expect(automationStudioFlowSettingsFingerprint(flowWith({ ...legacy, flowSizeSettings: { maxNodesPerSubflow: 100 } }))).toBe(legacyRevision);
  });

  it("moves the settings revision when the setting changes what a build may write", () => {
    const base = createBlankAutomationStudioFlowArtifact({ projectId: "project.size", flowId: "flow.size", name: "Sized", now: 1 });
    const raised = flowWith({ ...(base.metadata ?? {}), flowSizeSettings: { maxNodesPerSubflow: 150 } });
    expect(automationStudioFlowSettingsFingerprint(raised)).not.toBe(automationStudioFlowSettingsFingerprint(base));
  });
});
