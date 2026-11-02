import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeDefinition } from "../../index.ts";
import { automationStudioResolveTargetRefresh } from "../index.ts";
function definition(overrides: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: "device.target", version: "1.0.0", label: "Target", description: "Target refresh declaration", category: "custom",
    source: { kind: "importer", domainId: "device", packageId: "device.package", implementationKey: "target" },
    availability: { kind: "domain", domainId: "device" }, capabilities: { executable: true }, inputs: [], outputs: [],
    parameters: [
      { id: "target", label: "Target", valueType: "json", targetRefresh: true, required: true },
      { id: "hint", label: "Hint", valueType: "string", targetRefresh: true }
    ], ...overrides
  };
}
const node = { id: "target", definitionId: "device.target", definitionVersion: "1.0.0" };
const policy = { id: "dispatch", definitionId: "builtin.policy.action" };
describe("canonical target refresh declaration resolution", () => {
  it("retains declared order and the exact optional removable write-set", () => {
    expect(automationStudioResolveTargetRefresh(node, {}, definition(), [])).toEqual({
      kind: "declared", refresh: { container: "node", definitionId: "device.target", definitionVersion: "1.0.0", parameterIds: ["target", "hint"], removableParameterIds: ["hint"] }
    });
  });
  it("reads targetRefresh descriptors without invoking accessors", () => {
    let reads = 0;
    const target = Object.defineProperty({ id: "target", label: "Target", valueType: "json" as const }, "targetRefresh", {
      get: () => {
        reads += 1;
        return true;
      }
    });
    expect(automationStudioResolveTargetRefresh(node, {}, definition({ parameters: [target] }), [])).toEqual({ kind: "absent", reason: "no_refresh_declaration" });
    expect(reads).toBe(0);
  });
  it("refuses duplicate, unsafe, padded and conditional commit fields", () => {
    for (const id of ["__proto__", "constructor", "prototype", " target", "target ", ""]) {
      const declared = definition({ parameters: [{ id, label: "Target", valueType: "json", targetRefresh: true }] });
      expect(automationStudioResolveTargetRefresh(node, {}, declared, [])).toEqual({ kind: "rejected", reason: "invalid_declaration" });
    }
    const duplicate = definition();
    duplicate.parameters.push({ ...duplicate.parameters[0]! });
    expect(automationStudioResolveTargetRefresh(node, {}, duplicate, [])).toEqual({ kind: "rejected", reason: "invalid_declaration" });
    const commit = definition({ actionEffect: { effectClass: "state", commitWhen: "apply" }, parameters: [{ id: "apply", label: "Apply", valueType: "boolean", targetRefresh: true }] });
    expect(automationStudioResolveTargetRefresh(node, {}, commit, [])).toEqual({ kind: "rejected", reason: "invalid_declaration" });
  });
  it("preserves version and missing-registration refusals", () => {
    expect(automationStudioResolveTargetRefresh({ ...node, definitionVersion: "2.0.0" }, {}, definition(), [])).toEqual({ kind: "rejected", reason: "invalid_declaration" });
    expect(automationStudioResolveTargetRefresh(node, {}, undefined, [])).toEqual({ kind: "absent", reason: "unregistered_definition" });
  });
  it("resolves only one registered output definition and retains the output container", () => {
    const output = definition({ outputAction: { allowedOutputIds: ["device.refresh"] } });
    expect(automationStudioResolveTargetRefresh(policy, { outputId: " device.refresh ", parameters: {} }, undefined, [output])).toEqual({
      kind: "declared", refresh: { container: "output", definitionId: output.id, definitionVersion: output.version, parameterIds: ["target", "hint"], removableParameterIds: ["hint"] }
    });
    const other = definition({ id: "device.other", outputAction: { fixedOutputId: "device.refresh" } });
    expect(automationStudioResolveTargetRefresh(policy, { outputId: "device.refresh", parameters: {} }, undefined, [output, other])).toEqual({ kind: "rejected", reason: "ambiguous_definition" });
    expect(automationStudioResolveTargetRefresh(policy, { outputId: "device.missing", parameters: {} }, undefined, [output])).toEqual({ kind: "absent", reason: "unregistered_definition" });
  });
  it("refuses unresolved, missing or non-object output parameter containers", () => {
    for (const parameters of [{}, { outputId: "" }, { outputId: "device.refresh" }, { outputId: "device.refresh", parameters: [] }, { outputId: "device.refresh", parameters: { $state: "pending" } }]) {
      expect(automationStudioResolveTargetRefresh(policy, parameters, undefined, [])).toEqual({ kind: "rejected", reason: "invalid_output" });
    }
  });
  it("reports unreadable registry declarations without inventing a write-set", () => {
    const declared = definition();
    Object.defineProperty(declared, "parameters", {
      get: () => {
        throw new Error("unavailable registry");
      }
    });
    expect(automationStudioResolveTargetRefresh(node, {}, declared, [])).toEqual({ kind: "unreadable", reason: "registry_unreadable" });
  });
});
