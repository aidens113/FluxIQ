import { describe, expect, it, vi } from "vitest";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION } from "../../../../nodes/index.ts";
import { definition, setup } from "../../../executor/unbound-reacquire/tests/fixtures.ts";

describe("canonical native target-refresh declaration and factory binding", () => {
  it("exposes only canonical opt-ins through the same native runtime factory", () => {
    const test = setup();
    expect(test.options.resolveTargetRefresh?.(test.node, test.node.parameterValues!)).toEqual({ kind: "declared", refresh: { container: "node", definitionId: "example.activate", definitionVersion: "1.0.0", parameterIds: ["selector", "element"], removableParameterIds: ["selector"] } });
    test.node.metadata = { targetRefresh: ["note"] };
    expect(test.options.resolveTargetRefresh?.(test.node, test.node.parameterValues!)).toMatchObject({ refresh: { parameterIds: ["selector", "element"] } });
    test.node.definitionVersion = "2.0.0";
    expect(test.options.resolveTargetRefresh?.(test.node, test.node.parameterValues!)).toEqual({ kind: "rejected", reason: "invalid_declaration" });
  });

  it("protects wrapper authority and rejects ambiguous registered output matches", () => {
    const test = setup("output");
    expect(test.native.resolveTargetRefresh(test.node, test.node.parameterValues!)).toMatchObject({ kind: "declared", refresh: { container: "output", parameterIds: ["selector", "element"] } });
    expect(test.native.resolveTargetRefresh(test.node, { outputId: "unregistered", parameters: {} })).toEqual({ kind: "absent", reason: "unregistered_definition" });
    expect(test.native.resolveTargetRefresh(test.node, { outputId: "example.activate", parameters: { $state: { path: "unresolved" } } })).toEqual({ kind: "rejected", reason: "invalid_output" });
    const first = definition();
    const second = { ...definition(), id: "example.alias" };
    const runtime = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.specimens", packageVersion: "1.0.0", domainId: "specimens", nodes: [first, second] }, { packageId: "example.specimens", packageVersion: "1.0.0", implementations: { activate: () => ({ outputs: {} }) } });
    expect(runtime.resolveTargetRefresh(test.node, test.node.parameterValues!)).toEqual({ kind: "rejected", reason: "ambiguous_definition" });
  });

  it("uses an output's own version and returns unreadable registry diagnostics without throwing", () => {
    const test = setup("output");
    const declared = definition();
    declared.version = "3.0.0";
    const runtime = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.specimens", packageVersion: "1.0.0", domainId: "specimens", nodes: [declared] }, { packageId: "example.specimens", packageVersion: "1.0.0", implementations: { activate: () => ({ outputs: {} }) } });
    test.node.definitionVersion = "1.0.0";
    expect(runtime.resolveTargetRefresh(test.node, test.node.parameterValues!)).toMatchObject({ kind: "declared", refresh: { definitionVersion: "3.0.0" } });
    vi.spyOn(test.native, "getDefinition").mockImplementation(() => { throw new Error("registry private details"); });
    expect(test.native.resolveTargetRefresh(test.node, test.node.parameterValues!)).toEqual({ kind: "unreadable", reason: "registry_unreadable" });
  });
});
