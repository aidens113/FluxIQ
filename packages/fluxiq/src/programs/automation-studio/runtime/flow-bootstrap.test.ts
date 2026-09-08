import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../nodes/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
  buildAutomationStudioFlowBootstrapContext,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapPlan
} from "./flow-bootstrap.ts";

type NodeDefinitionOverrides = Omit<Partial<AutomationStudioNodeDefinition>, "outputAction"> & { outputAction?: AutomationStudioNodeDefinition["outputAction"] | undefined };

function definition(overrides: NodeDefinitionOverrides = {}): AutomationStudioNodeDefinition {
  const candidate = {
    schemaVersion: "0.1",
    id: "domain.demo.action",
    version: "1.2.3",
    label: "Demo action",
    description: "Performs a domain action.",
    category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "demo.action" },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    inputs: [{ id: "input", label: "Input", valueType: "string" }],
    outputs: [{ id: "result", label: "Result", valueType: "string" }],
    parameters: [{ id: "target", label: "Target", valueType: "string", required: true, constraints: { minLength: 1, maxLength: 20 } }],
    outputAction: { allowedOutputIds: ["demo.click"] },
    ...overrides
  };
  if (candidate.outputAction === undefined) delete (candidate as { outputAction?: unknown }).outputAction;
  return candidate as AutomationStudioNodeDefinition;
}

function plan(): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: {
      name: "Main router",
      rules: [],
      fallback: { kind: "subflow", targetSubflowKey: "primary" }
    },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [
        { key: "source", definitionId: "domain.demo.source", definitionVersion: "1.0.0" },
        { key: "action", definitionId: "domain.demo.action", definitionVersion: "1.2.3", parameters: { target: "submit" }, outputActionId: "demo.click" }
      ],
      edges: [{
        key: "source_action",
        source: { nodeKey: "source", portId: "value" },
        target: { nodeKey: "action", portId: "input" }
      }]
    }]
  };
}

function registry(): AutomationStudioNodeRegistry {
  return new AutomationStudioNodeRegistry([
    definition({
      id: "domain.demo.source",
      version: "1.0.0",
      label: "Source",
      description: "Provides a value.",
      source: { kind: "importer", domainId: "demo", implementationKey: "demo.source" },
      inputs: [],
      outputs: [{ id: "value", label: "Value", valueType: "string" }],
      parameters: [],
      outputAction: undefined
    }),
    definition(),
    definition({
      id: "domain.other.hidden",
      source: { kind: "importer", domainId: "other", implementationKey: "other.hidden" },
      availability: { kind: "domain", domainId: "other" },
      outputAction: undefined
    }),
    definition({
      id: "domain.demo.requires-camera",
      source: { kind: "importer", domainId: "demo", implementationKey: "demo.camera" },
      requiredRuntimeCapabilities: ["camera"],
      outputAction: undefined
    }),
    definition({
      id: "domain.demo.requires-admin",
      source: { kind: "importer", domainId: "demo", implementationKey: "demo.admin" },
      safety: { requiredPermissions: ["admin"] },
      outputAction: undefined
    })
  ]);
}

const resolution = {
  scope: { kind: "domain" as const, domainId: "demo" },
  runtimeCapabilities: [] as string[],
  permissions: [] as string[]
};

describe("Automation Studio Flow bootstrap contract", () => {
  it("publishes a compact schema with no recording or timeline vocabulary", () => {
    const serialized = JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA);
    expect(serialized).toContain("flow_bootstrap");
    expect(serialized).not.toMatch(/recording|timeline|event/i);
  });

  it("builds a deterministic catalog already filtered by scope, capabilities, and permissions", () => {
    const context = buildAutomationStudioFlowBootstrapContext({ registry: registry(), resolution });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.action", "domain.demo.source"]);
    expect(context.nodeCatalog[0]).toMatchObject({
      version: "1.2.3",
      inputs: [{ id: "input", type: "string" }],
      outputAction: { allowed: ["demo.click"] }
    });
    expect(JSON.stringify(context).length).toBeLessThan(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes);
  });

  it("retains required instruction synonyms before lower-ranked catalog entries", () => {
    const actions = [
      ["domain.demo.type", "Type text", "demo.type"],
      ["domain.demo.select", "Select option", "demo.select"],
      ["domain.demo.click", "Click button", "demo.click"],
      ["domain.demo.wait_text", "Wait for text", "demo.wait_text"]
    ].map(([id, label, outputId]) => definition({
      id: id!,
      label: label!,
      description: `${label} in the active target.`,
      source: { kind: "importer", domainId: "demo", implementationKey: outputId! },
      outputAction: { fixedOutputId: outputId! }
    }));
    const noise = Array.from({ length: 35 }, (_, index) => definition({
      id: `domain.demo.noise_${index}`,
      label: `Unrelated ${index}`,
      description: "Unrelated operation.",
      source: { kind: "importer", domainId: "demo", implementationKey: `demo.noise_${index}` },
      outputAction: undefined
    }));
    const context = buildAutomationStudioFlowBootstrapContext({
      registry: new AutomationStudioNodeRegistry([...noise, ...actions]),
      resolution,
      instructionText: "Enter a value, choose an option, submit the button, and verify the result text.",
      maxCatalogBytes: 5_000
    });
    expect(context.catalogSelection).toMatchObject({
      requiredTerms: ["enter", "choose", "submit", "verify"],
      missingRequiredTerms: []
    });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "domain.demo.click",
      "domain.demo.select",
      "domain.demo.type",
      "domain.demo.wait_text"
    ]));
  });
  it("truncates an oversized available catalog deterministically", () => {
    const definitions = Array.from({ length: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries + 5 }, (_, index) => definition({
      id: `domain.demo.node_${String(index).padStart(3, "0")}`,
      source: { kind: "importer", domainId: "demo", implementationKey: `demo.node_${index}` },
      outputAction: undefined
    }));
    const context = buildAutomationStudioFlowBootstrapContext({ registry: new AutomationStudioNodeRegistry(definitions), resolution });
    expect(context.catalogTruncated).toBe(true);
    expect(context.nodeCatalog.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries);
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual([...context.nodeCatalog.map((entry) => entry.id)].sort());
  });

  it("rejects recording fields and durable-looking symbolic keys at the parser boundary", () => {
    const invalid = plan() as unknown as Record<string, unknown>;
    invalid.recordingId = "recording.private";
    (invalid.subflows as Array<Record<string, unknown>>)[0]!.key = "subflow.durable";
    const result = parseAutomationStudioFlowBootstrapPlan(invalid);
    expect(result.plan).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["bootstrap.unexpected_field", "bootstrap.invalid_symbol"]));
  });

  it("validates registry definitions and assigns deterministic non-overlapping layout", () => {
    const first = validateAutomationStudioFlowBootstrapPlan({ plan: plan(), registry: registry(), resolution });
    const second = validateAutomationStudioFlowBootstrapPlan({ plan: plan(), registry: registry(), resolution });
    expect(first).toMatchObject({ ok: true, issues: [], validated: { risk: "medium" } });
    expect(first.validated?.subflows[0]?.nodes).toEqual(second.validated?.subflows[0]?.nodes);
    const positions = first.validated?.subflows[0]?.nodes.map((node) => `${node.position.x}:${node.position.y}`) ?? [];
    expect(new Set(positions).size).toBe(positions.length);
    expect(first.validated?.subflows[0]?.nodes).toMatchObject([
      { key: "source", position: { x: 0, y: 0 } },
      { key: "action", position: { x: 320, y: 0 } }
    ]);
  });

  it.each([
    ["definition version", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.nodes[0]!.definitionVersion = "9.9.9"; }, "bootstrap.definition_version_mismatch"],
    ["unknown definition", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.nodes[0]!.definitionId = "domain.demo.missing"; }, "bootstrap.definition_unavailable"],
    ["unknown parameter", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.nodes[1]!.parameters = { target: "submit", surprise: true }; }, "bootstrap.unknown_parameter"],
    ["invalid parameter", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.nodes[1]!.parameters = { target: "" }; }, "bootstrap.invalid_parameter_value"],
    ["source port", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.edges[0]!.source.portId = "missing"; }, "bootstrap.unknown_source_port"],
    ["target port", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.edges[0]!.target.portId = "missing"; }, "bootstrap.unknown_target_port"],
    ["output contract", (value: AutomationStudioFlowBootstrapPlan) => { value.subflows[0]!.nodes[1]!.outputActionId = "demo.delete"; }, "bootstrap.invalid_output_action"],
    ["router target", (value: AutomationStudioFlowBootstrapPlan) => { value.router.fallback = { kind: "subflow", targetSubflowKey: "missing" }; }, "bootstrap.unknown_router_fallback"]
  ])("rejects invalid %s", (_name, mutate, code) => {
    const value = plan();
    mutate(value);
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: value, registry: registry(), resolution });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it("rejects disconnected, cyclic, and over-deep graphs", () => {
    const disconnected = plan();
    disconnected.subflows[0]!.nodes.push({ key: "orphan", definitionId: "domain.demo.source", definitionVersion: "1.0.0" });
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: disconnected, registry: registry(), resolution }).issues.map((issue) => issue.code)).toContain("bootstrap.disconnected_graph");

    const cyclic = plan();
    cyclic.subflows[0]!.edges.push({
      key: "action_source",
      source: { nodeKey: "action", portId: "result" },
      target: { nodeKey: "source", portId: "value" }
    });
    const cyclicCodes = validateAutomationStudioFlowBootstrapPlan({ plan: cyclic, registry: registry(), resolution }).issues.map((issue) => issue.code);
    expect(cyclicCodes).toContain("bootstrap.cyclic_graph");

    const deepRegistry = registry();
    const deep = plan();
    deep.subflows[0]!.nodes = [];
    deep.subflows[0]!.edges = [];
    for (let index = 0; index <= AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxGraphDepth; index += 1) {
      deep.subflows[0]!.nodes.push({ key: `node_${index}`, definitionId: "domain.demo.source", definitionVersion: "1.0.0" });
      if (index > 0) deep.subflows[0]!.edges.push({
        key: `edge_${index}`,
        source: { nodeKey: `node_${index - 1}`, portId: "value" },
        target: { nodeKey: `node_${index}`, portId: "value" }
      });
    }
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: deep, registry: deepRegistry, resolution }).issues.map((issue) => issue.code)).toContain("bootstrap.graph_too_deep");
  });

  it("rejects plans exceeding the structural count and byte ceilings", () => {
    const tooMany = plan() as unknown as JsonObject;
    (tooMany.subflows as unknown[]) = Array.from({ length: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows + 1 }, (_, index) => ({
      key: `subflow_${index}`, name: "Subflow", role: index === 0 ? "primary" : "utility", nodes: [], edges: []
    }));
    expect(parseAutomationStudioFlowBootstrapPlan(tooMany).issues.map((issue) => issue.code)).toContain("bootstrap.too_many_subflows");

    const tooLarge = plan() as unknown as JsonObject;
    (tooLarge.router as JsonObject).name = "x".repeat(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxPlanBytes);
    const codes = parseAutomationStudioFlowBootstrapPlan(tooLarge).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["bootstrap.invalid_text", "bootstrap.plan_too_large"]));
  });

  it("derives high risk from privileged definitions instead of accepting model-supplied risk", () => {
    const highRegistry = registry().register(definition({
      id: "domain.demo.privileged",
      source: { kind: "importer", domainId: "demo", implementationKey: "demo.privileged" },
      safety: { privileged: true, runtime: { childProcess: true } },
      inputs: [],
      parameters: [],
      outputAction: undefined
    }));
    const value = plan();
    value.subflows[0]!.nodes = [{ key: "privileged", definitionId: "domain.demo.privileged", definitionVersion: "1.2.3" }];
    value.subflows[0]!.edges = [];
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: value, registry: highRegistry, resolution });
    expect(result.validated?.risk).toBe("high");
  });
});
