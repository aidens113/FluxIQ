import { describe, expect, it } from "vitest";
import {
  AutomationStudioNodeRegistry,
  canonicalBuiltinAutomationNodeDefinitions,
  validateAutomationStudioImporterNodeManifest,
  validateAutomationStudioNodeDefinition,
  type AutomationStudioImporterNodeManifest,
  type AutomationStudioNodeDefinition
} from "./index.ts";

function importerNode(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: "domain.orders.submit",
    version: "1.0.0",
    label: "Submit order",
    description: "Submit an order through the active domain runtime.",
    category: "integration",
    source: { kind: "importer", domainId: "orders", implementationKey: "orders.submit" },
    availability: { kind: "domain", domainId: "orders" },
    capabilities: { executable: true, stateAware: true, recordable: true },
    requiredRuntimeCapabilities: ["orders.runtime"],
    safety: { requiredPermissions: ["runtime.control"] },
    inputs: [{ id: "in", label: "In", valueType: "any", role: "control" }],
    outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }],
    parameters: []
  };
}

describe("canonical Automation Studio node registry", () => {
  it("adapts every built-in node to the canonical definition contract", () => {
    expect(canonicalBuiltinAutomationNodeDefinitions.length).toBeGreaterThan(0);
    for (const definition of canonicalBuiltinAutomationNodeDefinitions) {
      expect(validateAutomationStudioNodeDefinition(definition), definition.id).toEqual({ ok: true, issues: [] });
      expect(definition.source.kind).toBe("builtin");
      expect(definition.availability).toEqual({ kind: "both" });
    }
    expect(canonicalBuiltinAutomationNodeDefinitions.find((node) => node.id === "builtin.routine.subroutine")?.category).toBe("flow");
  });

  it("exposes importer nodes only to the matching domain with requirements satisfied", () => {
    const manifest: AutomationStudioImporterNodeManifest = {
      schemaVersion: "0.1",
      domainId: "orders",
      nodes: [importerNode()]
    };
    const registry = new AutomationStudioNodeRegistry().registerImporterManifest(manifest);

    expect(registry.get("domain.orders.submit", { scope: { kind: "global" } })).toBeUndefined();
    expect(registry.get("domain.orders.submit", { scope: { kind: "domain", domainId: "billing" } })).toBeUndefined();
    expect(registry.get("domain.orders.submit", { scope: { kind: "domain", domainId: "orders" } })).toBeUndefined();
    expect(registry.get("domain.orders.submit", {
      scope: { kind: "domain", domainId: "orders" },
      runtimeCapabilities: ["orders.runtime"]
    })).toBeUndefined();
    expect(registry.get("domain.orders.submit", {
      scope: { kind: "domain", domainId: "orders" },
      runtimeCapabilities: ["orders.runtime"],
      permissions: ["runtime.control"]
    })).toMatchObject({ id: "domain.orders.submit", source: { kind: "importer", domainId: "orders" } });
  });

  it("rejects malformed importer definitions instead of widening their scope", () => {
    const invalidManifest: AutomationStudioImporterNodeManifest = {
      schemaVersion: "0.1",
      domainId: "orders",
      nodes: [{ ...importerNode(), availability: { kind: "both" } }]
    };
    expect(validateAutomationStudioImporterNodeManifest(invalidManifest).issues.map((issue) => issue.code)).toContain("node.importer_scope_mismatch");
    expect(() => new AutomationStudioNodeRegistry().registerImporterManifest(invalidManifest)).toThrow("node.importer_scope_mismatch");
  });
});
