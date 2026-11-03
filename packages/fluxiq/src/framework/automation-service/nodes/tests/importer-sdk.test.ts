import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, AutomationStudioImporterSdkRegistry, validateAutomationStudioImporterSdkManifest, type AutomationStudioImporterSdkManifest } from "../importer-sdk.ts";

describe("automation importer SDK state visualizers", () => {
  it("registers declarative state visualizers without executable renderer code", () => {
    const manifest: AutomationStudioImporterSdkManifest = {
      schemaVersion: "0.1",
      sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
      packageId: "example.importer",
      packageVersion: "1.0.0",
      domainId: "example",
      nodes: [],
      stateVisualizers: [{
        id: "example.screen",
        version: "1.0.0",
        label: "Example Screen",
        supportedNamespaces: ["ui"],
        supportedKinds: ["screen"],
        supportedRendererIds: ["example.screen"],
        metadata: { packageId: "example.importer", domainId: "example" }
      }]
    };

    expect(validateAutomationStudioImporterSdkManifest(manifest)).toEqual([]);
    const registry = new AutomationStudioImporterSdkRegistry().register(manifest);
    expect(registry.get("example.importer")?.stateVisualizers?.[0]).toMatchObject({
      id: "example.screen",
      label: "Example Screen"
    });
  });

  it("rejects duplicate, invalid, mismatched, or capability-claiming visualizers", () => {
    const manifest: AutomationStudioImporterSdkManifest = {
      schemaVersion: "0.1",
      sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
      packageId: "example.importer",
      packageVersion: "1.0.0",
      domainId: "example",
      nodes: [],
      stateVisualizers: [
        { id: "screen", version: "1.0", label: "Screen", supportedNamespaces: ["ui", "ui"] },
        { id: "screen", version: "1.0.0", label: "Other", metadata: { packageId: "other.importer", implementationKey: "render" } }
      ]
    };

    expect(validateAutomationStudioImporterSdkManifest(manifest)).toEqual(expect.arrayContaining([
      "importer_sdk.duplicate_state_visualizer_id",
      "importer_sdk.invalid_state_visualizer_version",
      "importer_sdk.invalid_state_visualizer_namespaces",
      "importer_sdk.state_visualizer_identity_mismatch",
      "importer_sdk.state_visualizer_claims_capability"
    ]));
  });
});
