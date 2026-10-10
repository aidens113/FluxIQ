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
    expect(canonicalBuiltinAutomationNodeDefinitions.find((node) => node.id === "builtin.routine.task-policy")?.category).toBe("flow");
    expect(canonicalBuiltinAutomationNodeDefinitions.find((node) => node.id === "builtin.control.call-subflow")?.category).toBe("control-flow");
    expect(canonicalBuiltinAutomationNodeDefinitions.some((node) => node.id === "builtin.routine.subroutine")).toBe(false);
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

describe("resolving a node id the model wrote slightly wrong", () => {
  const global = { scope: { kind: "global" } } as const;

  it("reports a verbatim id as exact and a separator or casing variant as normalized", () => {
    const registry = new AutomationStudioNodeRegistry();

    expect(registry.matchDefinition("builtin.data.filter-list", global)?.match).toEqual({
      id: "builtin.data.filter-list",
      how: "exact",
      score: 1
    });
    for (const written of ["builtin.data.filter_list", "builtin/data/filter-list", "Builtin.Data.FilterList"]) {
      expect(registry.matchDefinition(written, global)?.match, written).toEqual({
        id: "builtin.data.filter-list",
        how: "normalized",
        score: 1
      });
    }
  });

  it("guesses the nearest available node rather than refusing a name it can place", () => {
    const resolved = new AutomationStudioNodeRegistry().matchDefinition("filterList", global);

    expect(resolved?.definition.id).toBe("builtin.data.filter-list");
    expect(resolved?.match.how).toBe("nearest");
    expect(resolved?.match.score).toBeGreaterThan(0.25);
  });

  it("never corrects into a node this resolution cannot see, and still refuses a name it cannot place", () => {
    const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, importerNode()]);

    // The importer node's own id, written verbatim: out of scope is still out of scope.
    expect(registry.matchDefinition("domain.orders.submit", global)).toBeUndefined();
    expect(registry.matchDefinition("domain.orders.submit", {
      scope: { kind: "domain", domainId: "orders" },
      runtimeCapabilities: ["orders.runtime"],
      permissions: ["runtime.control"]
    })?.definition.id).toBe("domain.orders.submit");
    expect(registry.matchDefinition("sendEmail", global)).toBeUndefined();
  });
});
