import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, parseAutomationStudioRecordOutput, type AutomationNodeParameter, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { buildAutomationStudioFlowBootstrapContext } from "../index.ts";
import { automationStudioFlowBootstrapRequiredTerms } from "../required-terms.ts";
import { webDomainNodeDefinitionsFixture } from "./web-domain-definitions-fixture.ts";

// What the model is told about the nodes it can use: every offered node, in
// catalog order, each whole. The user's order of 2026-09-30: "Remove ANY AND ALL
// LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION OR
// USE ANY RANKING ALGORITHM." Until then the catalog was ranked against the
// instruction, filled to a byte budget and an entry cap, and its labels,
// descriptions and parameter text were cut.

const resolution = {
  scope: { kind: "domain" as const, domainId: "demo" },
  runtimeCapabilities: [] as string[],
  permissions: [] as string[]
};

function definition(id: string, overrides: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label: "Unrelated",
    description: "Unrelated operation.",
    category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: id },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    inputs: [],
    outputs: [],
    parameters: [],
    ...overrides
  };
}

function catalogFor(definitions: AutomationStudioNodeDefinition[], instructionText?: string) {
  return buildAutomationStudioFlowBootstrapContext({
    registry: new AutomationStudioNodeRegistry(definitions),
    resolution,
    ...(instructionText !== undefined ? { instructionText } : {})
  });
}

describe("a node's label and description in the catalog", () => {
  it("are kept whole however long they are", () => {
    const label = `Read ${"every ".repeat(40)}item`;
    const description = `${"word ".repeat(400)}end`;

    const [entry] = catalogFor([definition("domain.demo.read", { label, description })]).nodeCatalog;

    expect(entry?.label).toBe(label);
    expect(entry?.description).toBe(description);
  });
});

describe("a structured parameter in the catalog", () => {
  const items: AutomationNodeParameter = {
    id: "items",
    label: "Items",
    valueType: "object",
    description: "{ item: CSS selector of one repeating item, fields: { key: selector or { selector, attribute } }, paginate?: { mode: next | loadMore | scroll | numbered, maxPages } }",
    example: { item: ".card", fields: { title: "h2", url: { selector: "a", attribute: "href" } } }
  };

  it("carries its description and example, so the model knows the shape to author", () => {
    const [entry] = catalogFor([definition("domain.demo.read", { parameters: [items] })]).nodeCatalog;

    expect(entry?.parameters).toEqual([{ id: "items", type: "object", description: items.description, example: items.example }]);
  });

  it("carries them for json and array parameters too, but not for a scalar parameter", () => {
    const parameters: AutomationNodeParameter[] = [
      { id: "save", label: "Save", valueType: "json", description: "Record output." },
      { id: "keys", label: "Keys", valueType: "array", description: "Keys to read.", example: ["a"] },
      { id: "timeoutMs", label: "Timeout", valueType: "number", description: "How long to wait.", example: 10_000 }
    ];

    const [entry] = catalogFor([definition("domain.demo.read", { parameters })]).nodeCatalog;

    expect(entry?.parameters).toEqual([
      { id: "save", type: "json", description: "Record output." },
      { id: "keys", type: "array", description: "Keys to read.", example: ["a"] },
      { id: "timeoutMs", type: "number" }
    ]);
  });

  it("carries a long description and a large example whole, and names nothing withheld", () => {
    const large: AutomationNodeParameter = { ...items, description: "d".repeat(5_000), example: { fields: "x".repeat(5_000) } };

    const context = catalogFor([definition("domain.demo.read", { parameters: [large] })]);
    const [parameter] = context.nodeCatalog[0]?.parameters ?? [];

    expect(parameter?.description).toBe("d".repeat(5_000));
    expect(parameter?.example).toEqual({ fields: "x".repeat(5_000) });
    expect(context.catalogSelection.withheldParameterText).toBeUndefined();
  });
});

describe("which nodes the catalog lists", () => {
  it("lists every offered node, in id order, whatever the instruction says", () => {
    const nodes = Array.from({ length: 250 }, (_, index) => definition(`domain.demo.node_${String(index).padStart(3, "0")}`, { tags: index === 249 ? ["scrape"] : [] }));

    const context = catalogFor([...nodes].reverse(), "Scrape the product rows");

    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(nodes.map((node) => node.id));
    expect(context.catalogTruncated).toBe(false);
    expect(context.catalogSelection.usedBytes).toBe(Buffer.byteLength(JSON.stringify(context.nodeCatalog), "utf8"));
    expect(context.catalogSelection).not.toHaveProperty("byteBudget");
  });

  it("is the same catalog for any instruction: nothing is ranked", () => {
    const nodes = [definition("domain.demo.click", { label: "Click" }), definition("domain.demo.harvest", { label: "Harvest", tags: ["scrape"] }), definition("domain.demo.other")];

    expect(catalogFor(nodes, "Scrape the rows").nodeCatalog).toEqual(catalogFor(nodes, "Click the button").nodeCatalog);
    expect(catalogFor(nodes, "Scrape the rows").nodeCatalog).toEqual(catalogFor(nodes).nodeCatalog);
  });
});

describe("the capabilities an instruction asks for", () => {
  const start = definition("domain.demo.start", { label: "Start", category: "control" });
  const end = definition("domain.demo.end", { label: "End", category: "control" });
  const click = definition("domain.demo.click", { label: "Click", outputAction: { fixedOutputId: "demo.click" } });

  it("are named, with start and end where the library has them", () => {
    const context = catalogFor([start, end, click, definition("domain.demo.other")], "Click the button");

    expect(context.catalogSelection).toMatchObject({ requiredTerms: ["click", "start", "end"], missingRequiredTerms: [] });
  });

  it("are reported missing when no offered node provides one", () => {
    const context = catalogFor([start, end], "Click the button");

    expect(context.catalogSelection).toMatchObject({ requiredTerms: ["click", "start", "end"], missingRequiredTerms: ["click"] });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.end", "domain.demo.start"]);
  });
});

describe("a catalog of the web domain's real definitions", () => {
  const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const definitions = webDomainNodeDefinitionsFixture();
  // The default registry carries the built-in start and end nodes beside the web domain's own.
  const registry = new AutomationStudioNodeRegistry();
  for (const webDefinition of definitions) registry.register(webDefinition);
  const catalog = (instructionText: string) => buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText });
  const offered = registry.list(web).map((item) => item.id).sort((left, right) => left.localeCompare(right));
  const formInstruction = "Using the connected browser page, enter Ada in Name, choose Team for Plan, submit the form, and verify the result says Submitted: Ada / team.";
  const scrapeInstruction = "Open the catalogue page, scrape every product name and price across every page, click Next until the last page, and verify the table has rows.";

  it("lists every web node for every instruction, and names what each asks for", () => {
    const cases: Array<[string, string[]]> = [
      [formInstruction, ["enter", "choose", "submit", "verify", "start", "end"]],
      ["Evidence-guided generation goal\nFill in the form with Ada as the name and the Team plan, then submit it.", ["fill", "submit", "start", "end"]],
      ["Enter Ada in the name field.", ["enter", "start", "end"]],
      ["Evidence-guided generation goal\nExport the coming week's schedule for the Northwind Trails account as a table with columns account, post, scheduled and status.", ["start", "end"]],
      ["Evidence-guided generation goal\nRename the workspace to Aurora Field Team and save the settings.", ["start", "end"]]
    ];
    for (const [instructionText, requiredTerms] of cases) {
      const context = catalog(instructionText);
      expect(context.nodeCatalog.map((entry) => entry.id), instructionText).toEqual(offered);
      expect(context.catalogSelection, instructionText).toMatchObject({ requiredTerms, missingRequiredTerms: [] });
    }
  });

  it("tells the model the list extraction's record output contract, whole", () => {
    const extract = catalog(scrapeInstruction).nodeCatalog.find((entry) => entry.id === "web.output.dom-extract_list");
    const recordOutput = extract?.parameters.find((parameter) => parameter.id === "recordOutput");

    for (const key of ["datasetId", "schema", "schemaVersion", "fields", "writeMode", "recordsPath"]) expect(recordOutput?.description).toContain(key);
    expect(recordOutput?.description).toContain("Leave empty to save every field");
    expect(parseAutomationStudioRecordOutput({ ...recordOutput?.example as JsonObject, recordsPath: "result.extracted" })).toMatchObject({ ok: true });
  });

  it("sends the web actions' authoring text whole", () => {
    const click = catalog(formInstruction).nodeCatalog.find((entry) => entry.id === "web.output.dom-click");
    expect(click?.parameters.find((parameter) => parameter.id === "expectedState")?.description).toContain("web.dom.assert conditions");
  });

  // An offered node whose parameters were trimmed away is worse than one node
  // fewer: the model cannot fill in what it was never shown. Every entry carries
  // every parameter id, type, default, option, constraint and required-ness, and
  // the definition's own label and description.
  it("carries everything each definition declares", () => {
    for (const entry of catalog(formInstruction).nodeCatalog) {
      const declared = registry.list(web).find((candidate) => candidate.id === entry.id)!;
      expect(entry.label).toBe(declared.label);
      expect(entry.description).toBe(declared.description);
      expect(entry.parameters.map((parameter) => ({ id: parameter.id, type: parameter.type, required: parameter.required, defaultValue: parameter.defaultValue, options: parameter.options, constraints: parameter.constraints })))
        .toEqual(declared.parameters.map((parameter) => ({
          id: parameter.id,
          type: parameter.valueType,
          required: parameter.required === true ? true : undefined,
          defaultValue: parameter.defaultValue,
          options: parameter.options?.map((option) => option.value),
          constraints: parameter.constraints
        })));
      expect(entry.inputs.length).toBe(declared.inputs.length);
      expect(entry.outputs.length).toBe(declared.outputs.length);
    }
  });
});

// Where the Flow starts is not a node: a build that was told where it starts
// is told, whatever the catalog holds.
describe("the start location a build was told", () => {
  const nodes = Array.from({ length: 8 }, (_, index) => definition(`domain.demo.node_${index}`));

  it("is carried into the context the model is shown", () => {
    const context = buildAutomationStudioFlowBootstrapContext({
      registry: new AutomationStudioNodeRegistry(nodes),
      resolution,
      startLocation: "http://127.0.0.1:53017/scenarios/everything-store/"
    });

    expect(context.startLocation).toBe("http://127.0.0.1:53017/scenarios/everything-store/");
    expect(context.nodeCatalog).toHaveLength(8);
  });

  it("is absent for a build that was given its target instead of told where it is", () => {
    expect(buildAutomationStudioFlowBootstrapContext({ registry: new AutomationStudioNodeRegistry(nodes), resolution }))
      .not.toHaveProperty("startLocation");
  });
});

function operationDefinition(overrides: Partial<AutomationStudioNodeDefinition> = {}): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: "demo.execute",
    version: "1.0.0",
    label: "Execute",
    description: "Perform the registered operation.",
    category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "execute" },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    inputs: [],
    outputs: [],
    parameters: [],
    ...overrides
  };
}

const chooseInstruction = "Choose a mode.";

describe("essential operations are provided by operation identity", () => {
  it.each([
    "Choose a value for the configuration.",
    "Pick the supplied state signature.",
    "Select the appropriate parameter value."
  ])("does not treat incidental help as a selection operation: %s", (description) => {
    const press = operationDefinition({ id: "demo.press", label: "Press", description });

    expect(automationStudioFlowBootstrapRequiredTerms([press], chooseInstruction))
      .toEqual([{ term: "choose", provided: false }]);
  });

  const incidentalShape: Array<[string, Partial<AutomationStudioNodeDefinition>]> = [
    ["parameter id", { parameters: [{ id: "option", label: "Option", valueType: "string" }] }],
    ["input port", { inputs: [{ id: "select", label: "Selection", role: "data", valueType: "string" }] }],
    ["output port", { outputs: [{ id: "pick", label: "Picked value", role: "data", valueType: "string" }] }],
    ["category", { category: "choose" }],
    // Trait keys are not operation declarations, including an additional key
    // supplied by an importer that happens to use an operation's name.
    ["capability key", { capabilities: Object.assign({ executable: true as const }, { choose: true }) }]
  ];

  it.each(incidentalShape)("does not grant selection from an incidental %s", (_name, shape) => {
    expect(automationStudioFlowBootstrapRequiredTerms([operationDefinition(shape)], chooseInstruction))
      .toEqual([{ term: "choose", provided: false }]);
  });

  const operationIdentity: Array<[string, Partial<AutomationStudioNodeDefinition>]> = [
    ["node id", { id: "demo.pick" }],
    ["label", { label: "Choose" }],
    ["tag", { tags: ["option"] }],
    ["fixed output id", { outputAction: { fixedOutputId: "demo.select" } }],
    ["allowed output id", { outputAction: { allowedOutputIds: ["demo.execute", "demo.select"] } }]
  ];

  it.each(operationIdentity)("recognizes a selection operation by its %s", (_name, identity) => {
    expect(automationStudioFlowBootstrapRequiredTerms([operationDefinition(identity)], chooseInstruction))
      .toEqual([{ term: "choose", provided: true }]);
  });

  it("still reports an unavailable operation beside an available one", () => {
    expect(automationStudioFlowBootstrapRequiredTerms([operationDefinition({ id: "demo.scroll" })], "Choose a mode and scroll."))
      .toEqual([{ term: "choose", provided: false }, { term: "scroll", provided: true }]);
  });

  it("keeps instruction token parsing and explicit foundation reporting", () => {
    const nodes = [
      operationDefinition({ id: "demo.begin" }),
      operationDefinition({ id: "demo.finish" }),
      operationDefinition({ id: "demo.select" })
    ];

    expect(automationStudioFlowBootstrapRequiredTerms(nodes, "PICK a mode."))
      .toEqual([{ term: "pick", provided: true }, { term: "start", provided: true }, { term: "end", provided: true }]);
    expect(automationStudioFlowBootstrapRequiredTerms(nodes, "")).toEqual([]);
  });

  it("keeps every offered node and its authoring help when an essential operation is missing", () => {
    const description = "Press a control. Choose the state signature supplied as its configuration.";
    const parameter = {
      id: "configuration",
      label: "Configuration",
      valueType: "object" as const,
      description: "Pick or select an observed state signature.",
      example: { state: "ready" }
    };
    const press = operationDefinition({ id: "demo.press", label: "Press", description, parameters: [parameter] });
    const context = buildAutomationStudioFlowBootstrapContext({
      registry: new AutomationStudioNodeRegistry([press]),
      resolution: { scope: { kind: "domain", domainId: "demo" } },
      instructionText: chooseInstruction
    });

    expect(context.catalogSelection.missingRequiredTerms).toEqual(["choose"]);
    expect(context.nodeCatalog).toHaveLength(1);
    expect(context.nodeCatalog[0]).toMatchObject({
      id: press.id,
      description,
      parameters: [{ id: parameter.id, type: parameter.valueType, description: parameter.description, example: parameter.example }]
    });
    expect(context.catalogTruncated).toBe(false);
  });
});
