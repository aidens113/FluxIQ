import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
  automationStudioEvidenceFlowBootstrapCompletionSchema,
  automationStudioEvidenceFlowBootstrapDraftCompletionSchema,
  automationStudioEvidenceFlowBootstrapLimitsExceeded,
  automationStudioFlowBootstrapOutputSchema,
  automationStudioFlowBootstrapSizeLimits,
  automationStudioFlowBootstrapSizeLimitsOfContext,
  buildAutomationStudioFlowBootstrapContext,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapEdge,
  type AutomationStudioFlowBootstrapNode,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSizeLimits
} from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "./index.ts";

// No Flow is capped at sixteen or sixty-four nodes any more: a Subflow holds
// what its Flow's size setting allows, a hundred by default, and a plan over it
// is refused naming the setting. The plans here are the web domain's real
// definitions carrying the parameters a long form-filling build writes.

const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

const SETTING = "flowSizeSettings.maxNodesPerSubflow, Flow Settings > Maximum nodes per Subflow";

/** The `index`th step of a long checkout: open the page, then type, choose, press and wait in turn. */
function step(index: number): AutomationStudioFlowBootstrapNode {
  const key = `n${index}`;
  if (index === 0) return { key, definitionId: "web.output.browser-navigate", definitionVersion: "1.0.0", parameters: { url: "https://shop.example.test/checkout", newTab: false }, outputActionId: "web.browser.navigate" };
  const field = `[data-testid=field-${index}]`;
  switch (index % 4) {
    case 1: return { key, definitionId: "web.output.dom-type", definitionVersion: "1.0.0", parameters: { selector: field, text: `Value for field ${index}`, timeoutMs: 10_000 }, outputActionId: "web.dom.type" };
    case 2: return { key, definitionId: "web.output.dom-select", definitionVersion: "1.0.0", parameters: { selector: field, value: `option-${index % 7}` }, outputActionId: "web.dom.select" };
    case 3: return {
      key, definitionId: "web.output.dom-click", definitionVersion: "1.0.0",
      parameters: { selector: `${field} button.next`, expectedState: { conditions: [{ kind: "visible", selector: `[data-testid=field-${index + 1}]`, expected: true }], mode: "all", timeoutMs: 5_000 } },
      outputActionId: "web.dom.click"
    };
    default: return { key, definitionId: "web.output.dom-wait_for_text", definitionVersion: "1.0.0", parameters: { text: `Step ${index} saved`, timeoutMs: 8_000 }, outputActionId: "web.dom.wait_for_text" };
  }
}

function edge(from: number, port: "success" | "failed", to: number): AutomationStudioFlowBootstrapEdge {
  return { key: `e${to}`, source: { nodeKey: `n${from}`, portId: port }, target: { nodeKey: `n${to}`, portId: "in" } };
}

function planOf(nodes: AutomationStudioFlowBootstrapNode[], edges: AutomationStudioFlowBootstrapEdge[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Checkout", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Fill in the checkout", role: "primary", nodes, edges }]
  };
}

/** A straight chain: each step runs on the success of the one before, so its depth is its length. */
function chainOf(count: number): AutomationStudioFlowBootstrapPlan {
  const nodes = Array.from({ length: count }, (_unused, index) => step(index));
  return planOf(nodes, nodes.slice(1).map((_node, index) => edge(index, "success", index + 1)));
}

/** A branched Subflow: each step's success and failure each lead on to a step of their own. */
function branchedOf(count: number): AutomationStudioFlowBootstrapPlan {
  const nodes = Array.from({ length: count }, (_unused, index) => step(index));
  return planOf(nodes, nodes.slice(1).map((_node, offset) => {
    const index = offset + 1;
    return edge(Math.floor((index - 1) / 2), index % 2 === 1 ? "success" : "failed", index);
  }));
}

function accepts(plan: AutomationStudioFlowBootstrapPlan, size?: AutomationStudioFlowBootstrapSizeLimits): void {
  const parsed = parseAutomationStudioFlowBootstrapPlan(plan, size);
  expect(parsed.issues).toEqual([]);
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution: web, ...(size ? { size } : {}) });
  expect(validated.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  expect(validated.ok).toBe(true);
  const result = { summary: "Fills in and submits the checkout form.", plan };
  expect(automationStudioEvidenceFlowBootstrapLimitsExceeded(result, "reply", size)).toEqual([]);
  expect(automationStudioEvidenceFlowBootstrapLimitsExceeded(result, "draft", size)).toEqual([]);
}

function refusesNodes(plan: AutomationStudioFlowBootstrapPlan, allowed: number, size?: AutomationStudioFlowBootstrapSizeLimits): void {
  const actual = plan.subflows[0]!.nodes.length;
  const message = `Subflow has ${actual} nodes; this Flow allows ${allowed} (${SETTING}).`;
  expect(parseAutomationStudioFlowBootstrapPlan(plan, size).issues).toContainEqual({ severity: "error", code: "bootstrap.invalid_nodes", message, path: "plan.subflows.0.nodes" });
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution: web, ...(size ? { size } : {}) });
  expect(validated.ok).toBe(false);
  expect(validated.issues.map((issue) => issue.message)).toContain(message);
  const setting = { path: "flowSizeSettings.maxNodesPerSubflow", label: "Flow Settings > Maximum nodes per Subflow", value: allowed };
  for (const source of ["reply", "draft"] as const) {
    expect(automationStudioEvidenceFlowBootstrapLimitsExceeded({ summary: "Fills in the checkout.", plan }, source, size))
      .toContainEqual({ limit: "maxNodesPerSubflow", max: allowed, actual, path: "plan.subflows.0.nodes", setting });
  }
}

describe("a Flow's size is its size setting", () => {
  it("accepts a hundred-node branched Subflow and a straight hundred-node chain at the default", () => {
    accepts(branchedOf(100));
    accepts(chainOf(100));
  });

  it("refuses the hundred-and-first node, naming the setting and its value", () => {
    refusesNodes(chainOf(101), 100);
    refusesNodes(branchedOf(101), 100);
  });

  it("holds a Flow set to a hundred and fifty nodes to a hundred and fifty", () => {
    const size = automationStudioFlowBootstrapSizeLimits(150);
    accepts(chainOf(150), size);
    refusesNodes(chainOf(151), 150, size);
  });

  it("holds a Flow set to twenty nodes to twenty", () => {
    const size = automationStudioFlowBootstrapSizeLimits(20);
    accepts(chainOf(20), size);
    refusesNodes(chainOf(21), 20, size);
  });

  it("names the setting a derived bound comes from", () => {
    const size = { ...automationStudioFlowBootstrapSizeLimits(), maxEdgesPerSubflow: 4, maxGraphDepth: 5 };
    const chain = chainOf(6);
    expect(parseAutomationStudioFlowBootstrapPlan(chain, size).issues.map((issue) => issue.message)).toContain(
      "Subflow has 5 edges; this Flow allows 4, derived from flowSizeSettings.maxNodesPerSubflow = 100 (Flow Settings > Maximum nodes per Subflow)."
    );
    const deep = validateAutomationStudioFlowBootstrapPlan({ plan: chain, registry, resolution: web, size: { ...size, maxEdgesPerSubflow: 200 } });
    expect(deep.issues).toContainEqual({
      severity: "error", code: "bootstrap.graph_too_deep", path: "plan.subflows.0.edges",
      message: "Subflow is 6 nodes deep; this Flow allows 5, derived from flowSizeSettings.maxNodesPerSubflow = 100 (Flow Settings > Maximum nodes per Subflow)."
    });
  });
});

describe("the schemas a provider is sent follow the Flow's size", () => {
  const subflowOf = (schema: JsonObject) => ((schema.$defs as JsonObject).subflow as JsonObject).properties as JsonObject;

  it("builds the output schema's node and edge counts from the size", () => {
    expect(subflowOf(automationStudioFlowBootstrapOutputSchema()).nodes).toMatchObject({ minItems: 1, maxItems: 100 });
    expect(subflowOf(automationStudioFlowBootstrapOutputSchema()).edges).toMatchObject({ minItems: 0, maxItems: 200 });
    expect(subflowOf(automationStudioFlowBootstrapOutputSchema(automationStudioFlowBootstrapSizeLimits(150))).nodes).toMatchObject({ maxItems: 150 });
    expect(subflowOf(automationStudioFlowBootstrapOutputSchema(automationStudioFlowBootstrapSizeLimits(150))).edges).toMatchObject({ maxItems: 300 });
  });

  it("bounds a written Flow script by the reply budget the size derives", () => {
    const flowOf = (schema: JsonObject) => (schema.properties as JsonObject).flow;
    expect(flowOf(automationStudioEvidenceFlowBootstrapCompletionSchema())).toMatchObject({ maxLength: 102_400 });
    expect(flowOf(automationStudioEvidenceFlowBootstrapCompletionSchema(automationStudioFlowBootstrapSizeLimits(150)))).toMatchObject({ maxLength: 153_600 });
    // A draft completion writes a sentence and names acts; nothing in it grows with the Flow.
    expect(automationStudioEvidenceFlowBootstrapDraftCompletionSchema(automationStudioFlowBootstrapSizeLimits(150))).toEqual(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA);
  });

  it("keeps each exported schema constant equal to the schema at the default size", () => {
    expect(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA).toEqual(automationStudioFlowBootstrapOutputSchema(automationStudioFlowBootstrapSizeLimits(100)));
    expect(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA).toEqual(automationStudioEvidenceFlowBootstrapCompletionSchema(automationStudioFlowBootstrapSizeLimits(100)));
    expect(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA).toEqual(automationStudioEvidenceFlowBootstrapDraftCompletionSchema(automationStudioFlowBootstrapSizeLimits(100)));
  });

  it("sends a bootstrap context the output schema for its Flow's size", () => {
    const context = (size?: AutomationStudioFlowBootstrapSizeLimits) => buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText: "Fill in the checkout form.", ...(size ? { size } : {}) });
    expect(context().outputSchema).toEqual(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA);
    expect(context(automationStudioFlowBootstrapSizeLimits()).outputSchema).toEqual(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA);
    expect(subflowOf(context(automationStudioFlowBootstrapSizeLimits(150)).outputSchema).nodes).toMatchObject({ maxItems: 150 });
  });

  // A provider adapter holds the request, not the Flow, so the context says
  // what size it was built for whenever that is not the default.
  it("carries a size other than the default, so the request alone sizes the schema and the parse", () => {
    const context = (size?: AutomationStudioFlowBootstrapSizeLimits) => buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText: "Fill in the checkout form.", ...(size ? { size } : {}) });
    expect(context()).not.toHaveProperty("maxNodesPerSubflow");
    expect(context(automationStudioFlowBootstrapSizeLimits())).not.toHaveProperty("maxNodesPerSubflow");
    const sized = context(automationStudioFlowBootstrapSizeLimits(150));
    expect(sized.maxNodesPerSubflow).toBe(150);
    expect(automationStudioFlowBootstrapSizeLimitsOfContext(sized)).toEqual(automationStudioFlowBootstrapSizeLimits(150));
    expect(sized.outputSchema).toEqual(automationStudioFlowBootstrapOutputSchema(automationStudioFlowBootstrapSizeLimitsOfContext(sized)));
  });
});
