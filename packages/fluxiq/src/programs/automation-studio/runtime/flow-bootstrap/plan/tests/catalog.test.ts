import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodeParameter, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, automationStudioFlowBootstrapCatalogByteBudget } from "../../index.ts";
import { buildAutomationStudioFlowBootstrapContext } from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "./web-domain-definitions-fixture.ts";

// What the model is told about a node: enough of its description to choose
// it, the shape of a structured parameter it has to author, and a ranking that
// lets a domain's own intent words bring the node into a bounded catalog.

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

function catalogFor(definitions: AutomationStudioNodeDefinition[], instructionText?: string, maxCatalogEntries?: number) {
  return buildAutomationStudioFlowBootstrapContext({
    registry: new AutomationStudioNodeRegistry(definitions),
    resolution,
    ...(instructionText !== undefined ? { instructionText } : {}),
    ...(maxCatalogEntries !== undefined ? { maxCatalogEntries } : {})
  });
}

describe("a node's description in the catalog", () => {
  it("is kept whole past 80 characters", () => {
    const description = "Reads every item of a repeating structure, following the next-page control until the last page is read.";
    expect(description.length).toBeGreaterThan(80);

    const [entry] = catalogFor([definition("domain.demo.read", { description })]).nodeCatalog;

    expect(entry?.description).toBe(description);
  });

  it("is bounded at 240 characters, and says where it was cut", () => {
    const [entry] = catalogFor([definition("domain.demo.read", { description: `${"word ".repeat(200)}end` })]).nodeCatalog;

    expect(entry?.description.length).toBe(240);
    expect(entry?.description.endsWith("...")).toBe(true);
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

  it("bounds the description at 600 characters and leaves out an example too large to send", () => {
    const large: AutomationNodeParameter = { ...items, description: "d".repeat(2_000), example: { fields: "x".repeat(700) } };

    const [entry] = catalogFor([definition("domain.demo.read", { parameters: [large] })]).nodeCatalog;
    const [parameter] = entry?.parameters ?? [];

    expect(parameter?.description?.length).toBe(600);
    expect(parameter?.description?.endsWith("...")).toBe(true);
    expect(parameter).not.toHaveProperty("example");
  });
});

describe("the tags a domain declares on a node", () => {
  const noise = Array.from({ length: 6 }, (_, index) => definition(`domain.demo.product_${index}`, { label: `Product ${index}` }));
  const harvest = definition("domain.demo.harvest", { label: "Harvest", description: "Reads things.", tags: ["scrape", "rows"] });

  it("bring the node into a bounded catalog when the instruction uses one", () => {
    const context = catalogFor([...noise, harvest], "Scrape the product rows", 3);

    expect(context.nodeCatalog.map((entry) => entry.id)).toContain("domain.demo.harvest");
    expect(context.catalogSelection.missingRequiredTerms).toEqual([]);
  });

  it("rank the node above one that matches only by description, even when the tag is too common to pin", () => {
    const described = definition("domain.demo.described", { description: "Collect rows." });
    const tagged = Array.from({ length: 4 }, (_, index) => definition(`domain.demo.tagged_${index}`, { tags: ["collect"] }));

    const context = catalogFor([described, ...tagged], "please collect", 1);

    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.tagged_0"]);
  });

  it("pin nothing when the tag is shared by many nodes, since it names a family rather than an intent", () => {
    const family = Array.from({ length: 5 }, (_, index) => definition(`domain.demo.family_${index}`, { label: `Alpha ${index}`, tags: ["output"] }));

    const context = catalogFor([...noise.slice(0, 2), ...family], "Output the product", 2);

    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.product_0", "domain.demo.product_1"]);
  });

  it("never fail the catalog when the node they pull in does not fit", () => {
    const click = definition("domain.demo.click", { label: "Click", outputAction: { fixedOutputId: "demo.click" } });

    const context = catalogFor([click, harvest], "Submit, then scrape", 1);

    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.click"]);
    expect(context.catalogSelection).toMatchObject({ requiredTerms: ["submit"], missingRequiredTerms: [] });
  });
});

describe("the nodes an instruction requires", () => {
  const start = definition("domain.demo.start", { label: "Start", category: "control" });
  const end = definition("domain.demo.end", { label: "End", category: "control" });
  const expectedState: AutomationNodeParameter = { id: "expectedState", label: "Expected State", valueType: "object", description: "Post-conditions checked after this action. ".repeat(12).trim() };
  const click = definition("domain.demo.click", {
    label: "Click",
    description: "Clicks one element of the page, waiting for it to be visible and enabled before the click is dispatched to it.",
    outputAction: { fixedOutputId: "demo.click" },
    parameters: [{ id: "selector", label: "Selector", valueType: "string", required: true }, expectedState]
  });
  const context = (maxCatalogBytes: number) => buildAutomationStudioFlowBootstrapContext({
    registry: new AutomationStudioNodeRegistry([start, end, click, definition("domain.demo.other", { label: "Other click" })]),
    resolution,
    instructionText: "Click the button",
    maxCatalogBytes
  });
  const whole = context(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes);
  const requiredWholeBytes = 2 + 2 + ["domain.demo.click", "domain.demo.start", "domain.demo.end"]
    .reduce((sum, id) => sum + Buffer.byteLength(JSON.stringify(whole.nodeCatalog.find((entry) => entry.id === id)), "utf8"), 0);

  it("are all kept when their whole text does not fit, with the text a model can do without left out", () => {
    const tight = context(requiredWholeBytes - 1);

    expect(tight.catalogSelection).toMatchObject({ requiredTerms: ["click", "start", "end"], missingRequiredTerms: [] });
    expect(tight.nodeCatalog.map((entry) => entry.id)).toEqual(expect.arrayContaining(["domain.demo.click", "domain.demo.end", "domain.demo.start"]));
    const condensed = tight.nodeCatalog.find((entry) => entry.id === "domain.demo.click");
    expect(condensed?.parameters).toEqual([{ id: "selector", type: "string", required: true }, { id: "expectedState", type: "object" }]);
    expect(condensed?.description).toHaveLength(80);
    expect(condensed?.description.endsWith("...")).toBe(true);
    expect(tight.catalogSelection.usedBytes).toBe(Buffer.byteLength(JSON.stringify(tight.nodeCatalog), "utf8"));
    expect(tight.catalogSelection.usedBytes).toBeLessThanOrEqual(tight.catalogSelection.byteBudget);
  });

  it("are sent whole once the budget allows, before any other node is added", () => {
    const exact = context(requiredWholeBytes);

    expect(exact.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.click", "domain.demo.end", "domain.demo.start"]);
    expect(exact.nodeCatalog).toEqual(whole.nodeCatalog.filter((entry) => entry.id !== "domain.demo.other"));
    expect(exact.catalogSelection.usedBytes).toBe(requiredWholeBytes);
  });

  it("are still reported missing when not even their shortest form fits", () => {
    const starved = context(600);

    expect(starved.catalogSelection.missingRequiredTerms).not.toEqual([]);
    expect(starved.catalogSelection.usedBytes).toBe(Buffer.byteLength(JSON.stringify(starved.nodeCatalog), "utf8"));
    expect(starved.catalogSelection.usedBytes).toBeLessThanOrEqual(600);
  });
});

describe("a catalog of the web domain's real definitions", () => {
  const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry();
  for (const webDefinition of webDomainNodeDefinitionsFixture()) registry.register(webDefinition);
  // The web domain's own acceptance test builds its catalog for exactly this
  // instruction in a 3,000-token context.
  const formInstruction = "Using the connected browser page, enter Ada in Name, choose Team for Plan, submit the form, and verify the result says Submitted: Ada / team.";
  const scrapeInstruction = "Open the catalogue page, scrape every product name and price across every page, click Next until the last page, and verify the table has rows.";
  const catalogAt = (instructionText: string, maxInputTokens: number, instructionBytes = Buffer.byteLength(instructionText, "utf8")) => buildAutomationStudioFlowBootstrapContext({
    registry,
    resolution: web,
    instructionText,
    maxCatalogBytes: automationStudioFlowBootstrapCatalogByteBudget({ maxInputTokens, instructionBytes })
  });

  it("keeps every node the form instruction requires in the web domain's 3,000-token context", () => {
    const context = catalogAt(formInstruction, 3_000);

    expect(context.catalogSelection.requiredTerms).toEqual(["enter", "choose", "submit", "verify", "start", "end"]);
    expect(context.catalogSelection.missingRequiredTerms).toEqual([]);
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "builtin.control.end", "builtin.control.start", "web.output.dom-click", "web.output.dom-select", "web.output.dom-type", "web.output.dom-wait_for_text"
    ]));
    expect(context.catalogSelection.usedBytes).toBeLessThanOrEqual(context.catalogSelection.byteBudget);
  });

  it("keeps every required node at every budget from that context up to the largest", () => {
    // A 1,536-byte instruction leaves too little of a 3,000-token context for
    // five nodes in any form, so that case starts at the live context.
    for (const [instructionText, instructionBytes, fromTokens] of [[formInstruction, 145, 3_000], [scrapeInstruction, 1_536, 4_000]] as const) {
      for (let maxInputTokens = fromTokens; maxInputTokens <= 20_000; maxInputTokens += 250) {
        const context = catalogAt(instructionText, maxInputTokens, instructionBytes);
        expect(context.catalogSelection.missingRequiredTerms, `${maxInputTokens} tokens, ${context.catalogSelection.byteBudget} bytes`).toEqual([]);
        expect(context.catalogSelection.usedBytes).toBe(Buffer.byteLength(JSON.stringify(context.nodeCatalog), "utf8"));
        expect(context.catalogSelection.usedBytes).toBeLessThanOrEqual(context.catalogSelection.byteBudget);
      }
    }
  });

  it("sends the required web actions whole in the context a live Flow creation uses", () => {
    const context = catalogAt(formInstruction, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens, 1_536);

    const click = context.nodeCatalog.find((entry) => entry.id === "web.output.dom-click");
    expect(click?.parameters.find((parameter) => parameter.id === "expectedState")?.description).toContain("web.dom.assert conditions");
  });
});

describe("an instruction to fill in a form", () => {
  const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry();
  for (const webDefinition of webDomainNodeDefinitionsFixture()) registry.register(webDefinition);
  // The live campaign's form task, as evidence-guided creation words it: the
  // instruction's title, then its body, in a 12-entry catalog. Its "Team plan"
  // is a choice list, but no word of it names choosing.
  const instructionText = "Evidence-guided generation goal\nFill in the form with Ada as the name and the Team plan, then submit it.";
  const catalog = (maxCatalogBytes: number) => buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText, maxCatalogEntries: 12, maxCatalogBytes });

  it("offers the node that sets a choice list, without requiring it", () => {
    const context = catalog(automationStudioFlowBootstrapCatalogByteBudget({ maxInputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens, instructionBytes: 442 }));

    expect(context.catalogSelection).toMatchObject({ requiredTerms: ["fill", "submit", "start", "end"], missingRequiredTerms: [] });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(expect.arrayContaining(["web.output.dom-type", "web.output.dom-click", "web.output.dom-select"]));
  });

  it("still builds when that node does not fit", () => {
    const required = catalog(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes).nodeCatalog
      .filter((entry) => ["web.output.dom-type", "web.output.dom-click", "builtin.control.start", "builtin.control.end"].includes(entry.id));
    const context = catalog(Buffer.byteLength(JSON.stringify(required), "utf8"));

    expect(context.catalogSelection.missingRequiredTerms).toEqual([]);
    expect(context.nodeCatalog.map((entry) => entry.id)).not.toContain("web.output.dom-select");
  });

  it("does not offer it to an instruction that only enters text", () => {
    const context = buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText: "Enter Ada in the name field.", maxCatalogEntries: 12 });

    expect(context.nodeCatalog.map((entry) => entry.id)).not.toContain("web.output.dom-select");
  });
});

describe("an instruction whose verbs are not the catalog's own action words", () => {
  const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry();
  for (const webDefinition of webDomainNodeDefinitionsFixture()) registry.register(webDefinition);
  const catalog = (body: string, maxCatalogBytes = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes) => buildAutomationStudioFlowBootstrapContext({
    registry, resolution: web, instructionText: `Evidence-guided generation goal\n${body}`, maxCatalogEntries: 12, maxCatalogBytes
  });

  // The live campaign's rename task: no word of it is "type", "enter",
  // "click" or "submit", so only start and end were reserved, the one web node
  // that scored was "Clear Field" (on "field"), and four created Flows only
  // cleared the name (`run-mu4vx5hj-fbb98886` and three variants).
  it("offers the nodes that enter a value and press a control, without requiring them", () => {
    const context = catalog("Rename the workspace to Aurora Field Team and save the settings.");

    expect(context.catalogSelection).toMatchObject({ requiredTerms: ["start", "end"], missingRequiredTerms: [] });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(expect.arrayContaining(["web.output.dom-type", "web.output.dom-click"]));
  });

  it("offers both ways of giving a control a new value to a word that does not say which", () => {
    const ids = catalog("Change the plan to Team and apply it.").nodeCatalog.map((entry) => entry.id);

    expect(ids).toEqual(expect.arrayContaining(["web.output.dom-type", "web.output.dom-select", "web.output.dom-click"]));
  });

  it("still builds when the offered nodes do not fit", () => {
    const required = catalog("Rename the workspace and save it.").nodeCatalog
      .filter((entry) => ["builtin.control.start", "builtin.control.end"].includes(entry.id));
    const context = catalog("Rename the workspace and save it.", Buffer.byteLength(JSON.stringify(required), "utf8"));

    expect(context.catalogSelection.missingRequiredTerms).toEqual([]);
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(["builtin.control.end", "builtin.control.start"]);
  });
});
