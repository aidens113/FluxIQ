import { describe, expect, it } from "vitest";
import {
  AutomationStudioNodeRegistry,
  canonicalBuiltinAutomationNodeDefinitions,
  validateAutomationStudioImporterNodeManifest,
  validateAutomationStudioNodeDefinition,
  type AutomationStudioImporterNodeManifest,
  type AutomationStudioNodeDefinition
} from "../index.ts";

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

describe("a parameter contract bound on the registry", () => {
  it("is returned for the node it was bound to, and for no other", () => {
    const contract = () => ["orders.submit.invalid"];
    const registry = new AutomationStudioNodeRegistry([importerNode()]).bindParameterContract("domain.orders.submit", contract);

    expect(registry.getParameterContract("domain.orders.submit")).toBe(contract);
    expect(registry.getParameterContract("builtin.policy.action")).toBeUndefined();
  });

  it("leaves the registered definition declarative, so it still copies", () => {
    const registry = new AutomationStudioNodeRegistry([importerNode()]).bindParameterContract("domain.orders.submit", () => []);

    expect(() => structuredClone(registry.get("domain.orders.submit"))).not.toThrow();
  });

  it("is refused for a node that is not registered, a built-in node, a second binding, or a value that is not a function", () => {
    const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, importerNode()]);

    expect(() => registry.bindParameterContract("domain.orders.missing", () => [])).toThrow("unregistered node definition");
    expect(() => registry.bindParameterContract("builtin.policy.action", () => [])).toThrow("built-in node definition");
    expect(() => registry.bindParameterContract("domain.orders.submit", "not a function" as never)).toThrow("must be a function");
    registry.bindParameterContract("domain.orders.submit", () => []);
    expect(() => registry.bindParameterContract("domain.orders.submit", () => [])).toThrow("already has a parameter contract");
  });
});
