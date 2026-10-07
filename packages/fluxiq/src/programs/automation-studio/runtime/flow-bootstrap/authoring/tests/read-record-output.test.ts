// Every read step writes a dataset of its own.
//
// A list read assembled with no record output and no columns named in the
// instruction used to leave its record output empty, so the domain derived a
// dataset id when it dispatched the step -- from the fields it read -- and two
// reads of the same shape (round 1: twenty unfiltered rows, then ten filtered
// ones) landed in one dataset. Assembly now writes the record output itself:
// the dataset id is the step's words as a slug plus the step's stable id, and
// the label is the list's name.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapRecordOutputIssues } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};
const definitions = webDomainNodeDefinitionsFixture();
const extractListDefinition = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;
const registry = new AutomationStudioNodeRegistry(definitions);

const READ = JSON.stringify({ item: "li.product", fields: { name: ".name", price: ".price", url: "a@href" } });

function readStep(description: string, extra: string[] = []): string[] {
  return [`step: ${description}`, "  node: web.dom.extract_list", `  extractList: ${READ}`, ...extra];
}

/** Each node's record output, in order, from a script accepted as the build accepts it. */
function recordOutputs(lines: string[], acceptWith: AutomationStudioNodeRegistry = registry): (JsonValue | undefined)[] {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: ["flow: Read the shop", ...lines].join("\n") }, registry: acceptWith, resolution });
  if (!accepted.ok) throw new Error(`The script was refused: ${accepted.issues.map((issue) => `${issue.code} ${issue.path}`).join(", ")}`);
  return accepted.plan.subflows.flatMap((subflow) => subflow.nodes.map((node) => node.parameters?.recordOutput));
}

describe("a read with no record output", () => {
  it("is given one: its fields, a dataset id of its words and step id, and its name as the label", () => {
    const [output] = recordOutputs(readStep("Read the product list"));

    expect(output).toMatchObject({ datasetId: "read-the-product-list-main-s1", label: "Read the product list", writeMode: "append" });
    const fields = ((output as JsonObject).schema as JsonObject).fields as JsonObject[];
    expect(fields.map((field) => field.id)).toEqual(["name", "price", "url"]);
    expect(automationStudioFlowBootstrapRecordOutputIssues(extractListDefinition, output)).toEqual([]);
  });

  it("two reads in one plan, even with one description, get distinct dataset ids", () => {
    const outputs = recordOutputs([...readStep("Read the product list"), ...readStep("Read the product list")]);
    const ids = outputs.map((output) => (output as JsonObject).datasetId);

    expect(ids).toEqual(["read-the-product-list-main-s1", "read-the-product-list-main-s2"]);
  });

  it("re-assembling the same plan gives the same ids", () => {
    const lines = [...readStep("Read the unfiltered list"), ...readStep("Read the filtered list")];

    expect(recordOutputs(lines)).toEqual(recordOutputs(lines));
  });
});

describe("a record output the model wrote", () => {
  it("keeps a written dataset id as written", () => {
    const [output] = recordOutputs(readStep("Read the product list", ["  recordOutput.datasetId: plus_earbuds"]));

    expect(output).toMatchObject({ datasetId: "plus_earbuds" });
  });

  it("with only a label, takes the step id too, so two steps with one label do not share", () => {
    const outputs = recordOutputs([
      ...readStep("Read page one", ["  recordOutput.label: Products"]),
      ...readStep("Read page two", ["  recordOutput.label: Products"])
    ]);

    expect(outputs.map((output) => (output as JsonObject).datasetId)).toEqual(["products-main-s1", "products-main-s2"]);
    expect(outputs.map((output) => (output as JsonObject).label)).toEqual(["Products", "Products"]);
  });

  it("carries a written process through untouched, under either spelling", () => {
    const process = { dedupe: { by: ["url"] } };
    const [first, second] = recordOutputs([
      ...readStep("Read page one", [`  recordOutput: ${JSON.stringify({ datasetId: "a", process })}`]),
      ...readStep("Read page two", [`  recordOutput: ${JSON.stringify({ datasetId: "b", processing: process })}`])
    ]);

    expect((first as JsonObject).process).toEqual(process);
    expect((second as JsonObject).process).toEqual(process);
  });
});

describe("what gains nothing", () => {
  it("a node that keeps no rows -- no records path -- is left as before", () => {
    const withoutPath = new AutomationStudioNodeRegistry(definitions.map((definition) => definition.id === extractListDefinition.id
      ? { ...definition, metadata: {} }
      : definition));

    expect(recordOutputs(readStep("Read the product list"), withoutPath)).toEqual([null]);
  });

  it("an extraction that reads no named field is left as before", () => {
    const lines = ["step: read the list", "  node: web.dom.extract_list", `  extractList: ${JSON.stringify({ item: "li.product" })}`];

    expect(recordOutputs(lines)).toEqual([null]);
  });

  it("a step that is not a read gains no record output", () => {
    expect(recordOutputs(["step: open the shop", "  node: web.browser.navigate", "  url: https://shop.test/"])).toEqual([undefined]);
  });
});

describe("a read in a plan written as JSON", () => {
  /** Each node's record output, in order, from a JSON plan accepted as the build accepts it. */
  function jsonRecordOutputs(nodes: JsonObject[]): (JsonValue | undefined)[] {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { summary: "Read the shop", plan: { subflows: [{ key: "main", nodes }] } }, registry, resolution });
    if (!accepted.ok) throw new Error(`The plan was refused: ${accepted.issues.map((issue) => `${issue.code} ${issue.path}`).join(", ")}`);
    return accepted.plan.subflows.flatMap((subflow) => subflow.nodes.map((node) => node.parameters?.recordOutput));
  }
  const readNode = (name: string, key?: string): JsonObject => ({
    ...(key ? { key } : {}),
    definitionId: "web.output.dom-extract_list",
    name,
    parameters: { extractList: JSON.parse(READ) as JsonObject }
  });

  it("takes its subflow and node key as the step id, so two reads under one name do not share a dataset", () => {
    const outputs = jsonRecordOutputs([readNode("Read the products"), readNode("Read the products")]);

    expect(outputs.map((output) => (output as JsonObject).datasetId)).toEqual(["read-the-products-main-s1", "read-the-products-main-s2"]);
    expect(outputs.map((output) => (output as JsonObject).label)).toEqual(["Read the products", "Read the products"]);
  });

  it("uses the node key it wrote, and gives the same id on every reading", () => {
    const nodes = [readNode("Read the products", "first"), readNode("Read the products", "second")];

    expect(jsonRecordOutputs(nodes).map((output) => (output as JsonObject).datasetId)).toEqual(["read-the-products-main-first", "read-the-products-main-second"]);
    expect(jsonRecordOutputs(nodes)).toEqual(jsonRecordOutputs(nodes));
  });
});
