import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
  automationStudioFlowBootstrapCatalogByteBudget,
  buildAutomationStudioFlowBootstrapContext,
  isAutomationStudioEvidenceFlowBootstrapResultWithinLimits,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapPlan
} from "../flow-bootstrap.ts";
import {
  AUTOMATION_STUDIO_LLM_CONSERVATIVE_UTF8_BYTES_PER_TOKEN,
  automationStudioLlmTokenBudgetBytes,
  estimateAutomationStudioLlmTokensFromUtf8Bytes
} from "../llm-token-estimation.ts";

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
  it("keeps the evidence-guided completion contract self-contained and a minimal three-action plan far below 4k output tokens", () => {
    const serializedSchema = JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA);
    expect(serializedSchema).not.toContain("$ref");
    expect(serializedSchema).not.toContain("$defs");
    expect(Buffer.byteLength(serializedSchema, "utf8")).toBeLessThan(5_000);

    const minimalWebPlan: AutomationStudioFlowBootstrapPlan = {
      schemaVersion: "0.1",
      router: { name: "Website task", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [{
        key: "primary", name: "Complete website task", role: "primary",
        nodes: [
          { key: "enter_name", definitionId: "web.output.dom-type", definitionVersion: "1.0.0", parameters: { selector: "[data-testid=instruction-name]", text: "Ada" }, outputActionId: "web.dom.type" },
          { key: "choose_plan", definitionId: "web.output.dom-select", definitionVersion: "1.0.0", parameters: { selector: "[data-testid=instruction-plan]", value: "team" }, outputActionId: "web.dom.select" },
          { key: "submit", definitionId: "web.output.dom-click", definitionVersion: "1.0.0", parameters: { selector: "[data-testid=instruction-submit]" }, outputActionId: "web.dom.click" }
        ],
        edges: [
          { key: "enter_choose", source: { nodeKey: "enter_name", portId: "success" }, target: { nodeKey: "choose_plan", portId: "in" } },
          { key: "choose_submit", source: { nodeKey: "choose_plan", portId: "success" }, target: { nodeKey: "submit", portId: "in" } }
        ]
      }]
    };
    const result = { summary: "Enter a name, choose the requested plan, and submit.", plan: minimalWebPlan };
    const resultBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    expect(resultBytes).toBeLessThan(1_500);
    expect(estimateAutomationStudioLlmTokensFromUtf8Bytes(resultBytes)).toBeLessThan(500);
    expect(isAutomationStudioEvidenceFlowBootstrapResultWithinLimits(result)).toBe(true);

    const oversized = structuredClone(result);
    oversized.summary = "x".repeat(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxSummaryLength + 1);
    expect(isAutomationStudioEvidenceFlowBootstrapResultWithinLimits(oversized)).toBe(false);
  });

  it("publishes a compact schema with no recording or timeline vocabulary", () => {
    const serialized = JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA);
    expect(serialized).toContain("flow_bootstrap");
    expect(serialized).not.toMatch(/recording|timeline|event/i);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(4_700);
    const firstLiveCatalogBytes = automationStudioFlowBootstrapCatalogByteBudget({
      maxInputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens,
      instructionBytes: 1_536
    });
    expect(AUTOMATION_STUDIO_LLM_CONSERVATIVE_UTF8_BYTES_PER_TOKEN).toBe(3);
    expect(automationStudioLlmTokenBudgetBytes(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens)).toBe(12_000);
    expect(estimateAutomationStudioLlmTokensFromUtf8Bytes(12_000)).toBe(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens);
    expect(firstLiveCatalogBytes).toBe(5_366);
  });

  it("publishes the strict parser shape and conditional catalog-bound node fields", () => {
    const schema = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA as Record<string, any>;
    const planSchema = schema.properties.plan;
    const defs = schema.$defs;

    expect(schema).toMatchObject({ type: "object", additionalProperties: false, required: ["kind", "summary", "plan"] });
    expect(planSchema).toMatchObject({ type: "object", additionalProperties: false, required: ["schemaVersion", "router", "subflows"] });
    expect(planSchema.properties.router).toMatchObject({ additionalProperties: false, required: ["name", "rules", "fallback"] });
    expect(planSchema.properties.subflows).toMatchObject({ minItems: 1, maxItems: 8, minContains: 1, maxContains: 1 });
    expect(defs.symbol.pattern).toBe("^[a-z][a-z0-9_-]{0,63}$");
    expect(defs.fallback.oneOf).toEqual([
      expect.objectContaining({ additionalProperties: false, required: ["kind", "targetSubflowKey"] }),
      expect.objectContaining({ additionalProperties: false, required: ["kind"] })
    ]);
    expect(defs.subflow.properties.nodes).toMatchObject({ minItems: 1, maxItems: 64 });
    expect(defs.subflow.properties.edges).toMatchObject({ minItems: 0, maxItems: 128 });
    expect(defs.node).toMatchObject({
      additionalProperties: false,
      required: ["key", "definitionId", "definitionVersion"],
      properties: {
        parameters: { type: "object", maxProperties: 256 },
        outputActionId: expect.objectContaining({ description: expect.stringContaining("Emit iff") })
      }
    });
    const evidencePlan = (AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA as Record<string, any>).properties.plan;
    const evidenceSubflow = evidencePlan.properties.subflows.items;
    expect(evidencePlan.description ?? AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA.description).toBeDefined();
    expect(evidenceSubflow.properties.nodes.description).toContain("outputActionId is mandatory");
    expect(evidenceSubflow.properties.edges.description).toContain("Connect every input marked required");
  });

  it("builds a deterministic catalog already filtered by scope, capabilities, and permissions", () => {
    const context = buildAutomationStudioFlowBootstrapContext({ registry: registry(), resolution });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.action", "domain.demo.source"]);
    expect(context.nodeCatalog[0]).toMatchObject({
      version: "1.2.3",
      inputs: [{ id: "input", type: "string" }],
      outputAction: { required: true, allowed: ["demo.click"] }
    });
    expect(JSON.stringify(context).length).toBeLessThan(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes);
  });

  it("publishes every contract needed to author a registry-valid action chain", () => {
    const controlInput = { id: "in", label: "In", valueType: "signal" as const, required: true };
    const actionOutput = { id: "success", label: "Success", valueType: "any" as const };
    const definitions = [
      definition({
        id: "domain.demo.start", version: "2.0.0", label: "Start", inputs: [],
        outputs: [{ id: "next", label: "Next", valueType: "any" }], parameters: [], outputAction: undefined
      }),
      ...["type", "select", "click"].map((action) => definition({
        id: `domain.demo.${action}`, version: "3.1.0", label: action,
        inputs: [controlInput], outputs: [actionOutput],
        parameters: [{ id: "selector", label: "Selector", valueType: "string", required: true }],
        outputAction: { fixedOutputId: `demo.${action}` }
      })),
      definition({
        id: "domain.demo.end", version: "2.0.0", label: "End", inputs: [controlInput],
        outputs: [], parameters: [], outputAction: undefined
      })
    ];
    const scopedRegistry = new AutomationStudioNodeRegistry(definitions);
    const context = buildAutomationStudioFlowBootstrapContext({
      registry: scopedRegistry, resolution,
      instructionText: "Type a value, select an option, click submit"
    });
    expect(context.nodeCatalog).toHaveLength(5);
    expect(context.nodeCatalog.filter((entry) => entry.outputAction).every((entry) => entry.outputAction?.required === true)).toBe(true);
    expect(context.nodeCatalog.find((entry) => entry.id === "domain.demo.select")).toMatchObject({
      version: "3.1.0",
      inputs: [{ id: "in", type: "signal", required: true }],
      outputs: [{ id: "success", type: "any" }],
      parameters: [{ id: "selector", type: "string", required: true }],
      outputAction: { required: true, fixed: "demo.select" }
    });

    const authored: AutomationStudioFlowBootstrapPlan = {
      schemaVersion: "0.1",
      router: { name: "Demo", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [{
        key: "primary", name: "Primary", role: "primary",
        nodes: definitions.map((item) => ({
          key: item.id.split(".").at(-1)!, definitionId: item.id, definitionVersion: item.version,
          ...(item.parameters.some((parameter) => parameter.required) ? { parameters: { selector: "#target" } } : {}),
          ...(item.outputAction?.fixedOutputId ? { outputActionId: item.outputAction.fixedOutputId } : {})
        })),
        edges: [
          { key: "start_type", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "type", portId: "in" } },
          { key: "type_select", source: { nodeKey: "type", portId: "success" }, target: { nodeKey: "select", portId: "in" } },
          { key: "select_click", source: { nodeKey: "select", portId: "success" }, target: { nodeKey: "click", portId: "in" } },
          { key: "click_end", source: { nodeKey: "click", portId: "success" }, target: { nodeKey: "end", portId: "in" } }
        ]
      }]
    };
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: authored, registry: scopedRegistry, resolution })).toMatchObject({ ok: true, issues: [] });
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

  it("supports a ranked evidence catalog entry cap without changing the ordinary catalog ceiling", () => {
    const definitions = Array.from({ length: 20 }, (_, index) => definition({
      id: `domain.demo.node_${String(index).padStart(2, "0")}`,
      label: index === 19 ? "Submit" : `Unrelated ${index}`,
      source: { kind: "importer", domainId: "demo", implementationKey: `demo.node_${index}` },
      outputAction: index === 19 ? { fixedOutputId: "demo.click" } : undefined
    }));
    const limited = buildAutomationStudioFlowBootstrapContext({
      registry: new AutomationStudioNodeRegistry(definitions), resolution,
      instructionText: "Submit the form", maxCatalogEntries: 12
    });
    const ordinary = buildAutomationStudioFlowBootstrapContext({ registry: new AutomationStudioNodeRegistry(definitions), resolution });
    expect(limited.nodeCatalog.length).toBeLessThanOrEqual(12);
    expect(limited.nodeCatalog.length).toBeGreaterThan(0);
    expect(limited.nodeCatalog.some((entry) => entry.id === "domain.demo.node_19")).toBe(true);
    expect(limited.catalogSelection.missingRequiredTerms).toEqual([]);
    expect(ordinary.nodeCatalog).toHaveLength(20);
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
