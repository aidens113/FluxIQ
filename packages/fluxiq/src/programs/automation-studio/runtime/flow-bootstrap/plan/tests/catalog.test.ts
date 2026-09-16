import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodeParameter, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { buildAutomationStudioFlowBootstrapContext } from "../index.ts";

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
