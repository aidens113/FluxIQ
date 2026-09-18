import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, parseAutomationStudioRecordOutput, type AutomationNodeParameter, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
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

  it("bring the node in condensed when only that form fits", () => {
    const wordy = definition("domain.demo.harvest", { label: "Harvest", description: `Reads things. ${"More words. ".repeat(20)}`, tags: ["scrape", "rows"] });
    const at = (maxCatalogBytes: number) => buildAutomationStudioFlowBootstrapContext({
      registry: new AutomationStudioNodeRegistry([wordy]), resolution, instructionText: "Scrape the rows", maxCatalogBytes
    });
    const wholeBytes = at(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes).catalogSelection.usedBytes;

    const tight = at(wholeBytes - 1);

    expect(tight.nodeCatalog.map((entry) => entry.id)).toEqual(["domain.demo.harvest"]);
    expect(tight.nodeCatalog[0]?.description).toHaveLength(80);
    expect(tight.catalogSelection.usedBytes).toBeLessThanOrEqual(wholeBytes - 1);
    expect(at(100).nodeCatalog).toEqual([]);
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

  // A scraping instruction prefers the list extraction by its tags, so it is
  // sent whole when that fits and condensed when only that does. Its record
  // output was refused in live runs for keys the catalog never named, so both
  // forms name them.
  it("tells the model the list extraction's record output contract, condensed and whole", () => {
    const forms = new Set<string>();
    for (let maxCatalogBytes = 500; maxCatalogBytes <= AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes; maxCatalogBytes += 100) {
      const context = buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText: scrapeInstruction, maxCatalogBytes });
      const extract = context.nodeCatalog.find((entry) => entry.id === "web.output.dom-extract_list");
      if (!extract) continue;
      const recordOutput = extract.parameters.find((parameter) => parameter.id === "recordOutput");
      for (const key of ["datasetId", "schema", "schemaVersion", "fields", "writeMode", "recordsPath"]) {
        expect(recordOutput?.description, `${maxCatalogBytes} bytes: ${key}`).toContain(key);
      }
      const condensed = extract.description.length <= 80;
      forms.add(condensed ? "condensed" : "whole");
      if (condensed) continue;
      expect(recordOutput?.description).toContain("Leave empty to save every field");
      expect(parseAutomationStudioRecordOutput({ ...recordOutput?.example as JsonObject, recordsPath: "result.extracted" })).toMatchObject({ ok: true });
    }
    expect(forms).toEqual(new Set(["condensed", "whole"]));
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

  it("does not make it something an instruction that only enters text asked for", () => {
    const context = buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText: "Enter Ada in the name field.", maxCatalogEntries: 12 });

    // "enter" implies entering and not choosing, so the choice node is nothing
    // this instruction named: it is not reserved, and the test above shows that
    // a budget which cannot carry it drops it. It is still offered while there
    // is room, because an instruction cannot be relied on to name what the Flow
    // has to do -- see the job below, which names no action at all.
    expect(context.catalogSelection.requiredTerms).toEqual(["enter", "start", "end"]);
  });
});

describe("an instruction that asks for data rather than for actions", () => {
  const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry();
  for (const webDefinition of webDomainNodeDefinitionsFixture()) registry.register(webDefinition);

  // The live campaign's week-ahead task, worded the way a person asks for a
  // report. It names no action, and its answer is 14 rows of 280, so the Flow
  // has to set two controls before it reads anything. Ranked by this text
  // alone the catalog held `[end, start, write-records, database.query,
  // dom-extract_list]`: the model was told that narrowing first was required
  // and handed nothing to narrow with, and it returned all 280 rows
  // (`run-mu6cwk2q-2d7d4200`).
  const instructionText = "Evidence-guided generation goal\nExport the coming week's schedule for the Northwind Trails account as a table with columns account, post, scheduled and status.";

  it("still offers a way to choose, to press and to enter", () => {
    const context = buildAutomationStudioFlowBootstrapContext({
      registry,
      resolution: web,
      instructionText,
      maxCatalogEntries: 12,
      maxCatalogBytes: automationStudioFlowBootstrapCatalogByteBudget({ maxInputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.firstLiveMaxInputTokens, instructionBytes: 442 })
    });

    expect(context.catalogSelection).toMatchObject({ requiredTerms: ["start", "end"], missingRequiredTerms: [] });
    expect(context.nodeCatalog.map((entry) => entry.id)).toEqual(expect.arrayContaining(["web.output.dom-select", "web.output.dom-click", "web.output.dom-type"]));
  });

  it("reserves the extraction a scraping job cannot do without before any of them", () => {
    // The acting nodes are offered last of the preferences, so a budget with
    // room for one preference spends it on the list extraction rather than on
    // a node the instruction never named.
    const whole = buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText, maxCatalogEntries: 12 });
    const reserved = whole.nodeCatalog.filter((entry) => ["builtin.control.start", "builtin.control.end", "web.output.dom-extract_list"].includes(entry.id));
    const context = buildAutomationStudioFlowBootstrapContext({
      registry,
      resolution: web,
      instructionText,
      maxCatalogEntries: 12,
      maxCatalogBytes: Buffer.byteLength(JSON.stringify(reserved), "utf8")
    });

    expect(context.nodeCatalog.map((entry) => entry.id)).toContain("web.output.dom-extract_list");
    expect(context.nodeCatalog.map((entry) => entry.id)).not.toContain("web.output.dom-select");
  });
});

describe("an instruction whose verbs are not the catalog's own action words", () => {
  const web = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
  const registry = new AutomationStudioNodeRegistry();
  for (const webDefinition of webDomainNodeDefinitionsFixture()) registry.register(webDefinition);
  const catalog = (body: string, maxCatalogBytes: number = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes) => buildAutomationStudioFlowBootstrapContext({
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

// An offered node whose parameters were trimmed away is worse than one node
// fewer: the model cannot fill in what it was never shown, and a Flow it
// builds from a half-listed node is refused for a parameter that was there all
// along. So the budget may drop a whole entry and may shorten prose, and may
// never drop a parameter id, type, default, option, constraint or
// required-ness -- in either form, at any budget the catalog accepts.
describe("what the catalog may never trim away", () => {
  const web = {
    scope: { kind: "domain" as const, domainId: "web-automation" },
    runtimeCapabilities: ["web.actions"],
    permissions: ["web-automation.action"]
  };
  const definitions = webDomainNodeDefinitionsFixture();
  const registry = new AutomationStudioNodeRegistry(definitions);
  const context = (maxCatalogBytes: number, instructionText = "Click the submit button and scrape every product.") =>
    buildAutomationStudioFlowBootstrapContext({ registry, resolution: web, instructionText, maxCatalogBytes });

  /** Everything an entry must carry about one parameter, whatever form it is in. */
  function contract(entry: { parameters: JsonObject[] } | { parameters: Array<Record<string, unknown>> }) {
    return entry.parameters.map((parameter) => ({
      id: parameter.id,
      type: parameter.type,
      required: parameter.required,
      defaultValue: parameter.defaultValue,
      options: parameter.options,
      constraints: parameter.constraints
    }));
  }

  function declared(id: string) {
    const definition = definitions.find((candidate) => candidate.id === id)!;
    return definition.parameters.map((parameter) => ({
      id: parameter.id,
      type: parameter.valueType,
      required: parameter.required === true ? true : undefined,
      defaultValue: parameter.defaultValue,
      options: parameter.options?.map((option) => option.value),
      constraints: parameter.constraints
    }));
  }

  /** The smallest budget at which the catalog still offers a node at all. */
  function smallestAcceptedBudget(): number {
    let low = 0;
    let high: number = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (context(middle).nodeCatalog.length > 0) high = middle;
      else low = middle + 1;
    }
    return low;
  }

  it("keeps every parameter id, type, default, option and constraint at every budget it accepts", () => {
    const smallest = smallestAcceptedBudget();
    expect(context(smallest).nodeCatalog.length).toBeGreaterThan(0);
    expect(context(smallest - 1).nodeCatalog).toEqual([]);

    for (const budget of [smallest, smallest + 200, 2_000, 6_000, 20_000, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes]) {
      const built = context(budget);
      for (const entry of built.nodeCatalog) {
        expect({ budget, id: entry.id, parameters: contract(entry as never) })
          .toEqual({ budget, id: entry.id, parameters: declared(entry.id) });
        expect(entry.inputs.length).toBe(definitions.find((candidate) => candidate.id === entry.id)!.inputs.length);
        expect(entry.outputs.length).toBe(definitions.find((candidate) => candidate.id === entry.id)!.outputs.length);
      }
    }
  });

  it("shortens the prose instead, which is the only thing a form changes", () => {
    const smallest = smallestAcceptedBudget();
    const tight = context(smallest).nodeCatalog[0]!;
    const whole = context(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes).nodeCatalog
      .find((entry) => entry.id === tight.id)!;

    // The condensed form is the whole one with text taken out, and nothing else.
    expect(tight.description.length).toBeLessThanOrEqual(whole.description.length);
    expect(contract(tight as never)).toEqual(contract(whole as never));
    expect(tight.outputAction).toEqual(whole.outputAction);
  });
});
