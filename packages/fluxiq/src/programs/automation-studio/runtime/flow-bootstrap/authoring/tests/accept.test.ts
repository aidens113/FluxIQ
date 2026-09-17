import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import {
  automationStudioFlowBootstrapRecordOutputIssues,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapPlan
} from "../../plan/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";

// The six codes most refused builds in the first full creation campaign came
// back with, each written the way the model wrote it, and each read now as the
// intent it carried. The proof of each is two-sided: the value as written is
// still refused by the contract it failed, and the value after normalisation
// is accepted by that same contract.
//
// The nested JSON plan is exercised alongside, because it must keep working:
// it is the shape every reply before this used, and it is still what a model
// gets if it writes one.

const definitions = [...webDomainNodeDefinitionsFixture(), ...canonicalBuiltinAutomationNodeDefinitions];
const registry = new AutomationStudioNodeRegistry(definitions);
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

const extractList = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;
const writeRecords = definitions.find((definition) => definition.id === "builtin.data.write-records")!;

function accept(result: JsonValue) {
  return acceptAutomationStudioFlowBootstrapResult({ result, registry, resolution });
}

/** The record output a node ends up with after one scrape step is read. */
function recordOutputFrom(written: JsonValue, definitionId = "web.output.dom-extract_list"): JsonValue | undefined {
  const accepted = accept({
    summary: "Scrape the products.",
    plan: { subflows: [{ nodes: [{
      definitionId, name: "Product catalogue",
      parameters: { ...(definitionId === "web.output.dom-extract_list" ? { extractList: { item: "li" } } : {}), recordOutput: written }
    }] }] }
  });
  expect(accepted.ok).toBe(true);
  if (!accepted.ok) return undefined;
  return accepted.plan.subflows[0]?.nodes[0]?.parameters?.recordOutput;
}

function refusedBy(definition: AutomationStudioNodeDefinition, value: JsonValue | undefined): string[] {
  return automationStudioFlowBootstrapRecordOutputIssues(definition, value);
}

describe("the record output a model half wrote", () => {
  it("record_output.unknown_key: keeps the intent of keys the contract does not name", () => {
    const written: JsonObject = { dataset: "products", columns: ["name", "price"], mode: "append", notes: "every page" };
    expect(refusedBy(extractList, written)).toContain("record_output.unknown_key");

    const read = recordOutputFrom(written);

    expect(refusedBy(extractList, read!)).toEqual([]);
    expect(read).toMatchObject({ datasetId: "products", writeMode: "append" });
  });

  it("record_output.invalid_dataset_id: makes a dataset id out of the name that was written", () => {
    const written: JsonObject = { datasetId: "Product Catalogue", schema: { fields: ["name"] } };
    expect(refusedBy(extractList, written)).toContain("record_output.invalid_dataset_id");

    const read = recordOutputFrom(written);

    expect(refusedBy(extractList, read!)).toEqual([]);
    expect((read as JsonObject).datasetId).toBe("Product-Catalogue");
  });

  it("record_schema.not_object: reads a list of column names as a schema", () => {
    const written: JsonObject = { datasetId: "products", schema: ["name", "price", "rating"] };
    expect(refusedBy(extractList, written)).toContain("record_schema.not_object");

    const read = recordOutputFrom(written) as JsonObject;

    expect(refusedBy(extractList, read)).toEqual([]);
    expect(read.schema).toEqual({
      schemaVersion: "0.1",
      fields: [
        { id: "name", label: "Name", valueType: "string" },
        { id: "price", label: "Price", valueType: "string" },
        { id: "rating", label: "Rating", valueType: "string" }
      ]
    });
  });

  it("record_output.missing_records_path: supplies the path the node already declares", () => {
    const written: JsonObject = { datasetId: "rows", schema: { fields: ["name"] }, writeMode: "append", recordsPath: "data.items" };
    // The node declares its own records path, so what the model wrote for it is dropped.
    const read = recordOutputFrom(written) as JsonObject;

    expect(Object.hasOwn(read, "recordsPath")).toBe(false);
    expect(refusedBy(extractList, read)).toEqual([]);
  });

  it("record_output.missing_records_path: a node that writes its own rows needs none either", () => {
    expect(refusedBy(writeRecords, { datasetId: "rows", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] }, writeMode: "append" }))
      .toEqual([]);
    const read = recordOutputFrom({ dataset: "rows", columns: "name, price" }, "builtin.data.write-records") as JsonObject;

    expect(refusedBy(writeRecords, read)).toEqual([]);
    expect(Object.hasOwn(read, "recordsPath")).toBe(false);
  });

  it("names the columns from the node's own request when the model wrote no schema", () => {
    const accepted = accept({
      flow: [
        "flow: Scrape the products",
        "step: read the product list",
        "  node: web.dom.extract_list",
        "  extractList.item: li.product",
        "  extractList.fields.name: .name",
        "  extractList.fields.price: .price",
        "  recordOutput: products"
      ].join("\n")
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const read = accepted.plan.subflows[0]?.nodes[0]?.parameters?.recordOutput as JsonObject;
    expect(read.datasetId).toBe("products");
    expect((read.schema as JsonObject).fields).toEqual([
      { id: "name", label: "Name", valueType: "string" },
      { id: "price", label: "Price", valueType: "string" }
    ]);
    expect(refusedBy(extractList, read)).toEqual([]);
  });
});

describe("a handle written where it is not quite a handle", () => {
  it("web.handle.malformed: a bare name where an object belongs becomes a handle reference", () => {
    const accepted = accept({
      flow: ["step: click the row", "  node: web.dom.click", "  selector: li", "  target: control.7"].join("\n")
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters?.target).toEqual({ handle: "control.7" });
  });

  it("web.handle.misplaced: a handle at the node's top level moves into the parameter that takes one", () => {
    const accepted = accept({
      summary: "Click the row.",
      plan: { subflows: [{ nodes: [{ definitionId: "web.dom.click", handle: "control.7", location: "https://shop.test/members", parameters: { selector: "li" } }] }] }
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters?.target).toEqual({ handle: "control.7", location: "https://shop.test/members" });
  });

  // That the key this writes is the one the resolver reads is held by a test
  // in `runtime/llm/harness-options/tests/`, which owns the resolver: reading
  // the constant back out of that directory would close a module cycle.
});

describe("the nested JSON plan, which still has to work", () => {
  // The shape the evidence-guided path asked for and every live reply returned.
  const capturedPlan: AutomationStudioFlowBootstrapPlan = {
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

  it("accepts a captured reply unchanged in what it says, and validates it", () => {
    const accepted = accept({ summary: "Enter a name, choose the requested plan, and submit.", plan: capturedPlan });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
    expect(validated.ok).toBe(true);
    expect(parseAutomationStudioFlowBootstrapPlan(accepted.plan).plan).toBeDefined();
    expect(accepted.summary).toBe("Enter a name, choose the requested plan, and submit.");
    expect(accepted.plan.subflows[0]?.nodes.map((node) => node.definitionId)).toEqual([
      "web.output.dom-type", "web.output.dom-select", "web.output.dom-click"
    ]);
    expect(accepted.plan.subflows[0]?.edges.map((edge) => `${edge.source.nodeKey}:${edge.source.portId}>${edge.target.nodeKey}:${edge.target.portId}`)).toEqual([
      "enter_name:success>choose_plan:in",
      "choose_plan:success>submit:in"
    ]);
  });

  it("derives the version, key, output action and edges a reply left out", () => {
    const accepted = accept({
      summary: "Open the members page and click the row.",
      plan: { subflows: [{ nodes: [
        { definitionId: "web.browser.navigate", parameters: { url: "https://shop.test/members" } },
        { definitionId: "web.dom.click", parameters: { selector: "li" } }
      ] }] }
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }).ok).toBe(true);
    expect(accepted.plan.subflows[0]?.nodes.map((node) => [node.key, node.definitionVersion, node.outputActionId])).toEqual([
      ["s1", "1.0.0", "web.browser.navigate"],
      ["s2", "1.0.0", "web.dom.click"]
    ]);
    expect(accepted.plan.subflows[0]?.edges).toEqual([
      { key: "e1", source: { nodeKey: "s1", portId: "success" }, target: { nodeKey: "s2", portId: "in" } }
    ]);
    expect(accepted.plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: "main" });
  });

  it("writes defaults onto a node built from JSON too", () => {
    const accepted = accept({ plan: { nodes: [{ definitionId: "web.browser.navigate", parameters: { url: "https://shop.test" } }] } });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters).toEqual({ url: "https://shop.test", newTab: false });
  });

  it("still refuses a key that names no parameter, with the node's parameter ids fed back", () => {
    const accepted = accept({ plan: { nodes: [{ definitionId: "web.browser.navigate", parameters: { url: "https://shop.test", speed: "fast" } }] } });

    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.issues.map((issue) => issue.code)).toContain("bootstrap.unknown_parameter");
    expect(accepted.issues[0]?.path).toBe("plan.subflows.0.nodes.0.parameters.speed");
  });
});
