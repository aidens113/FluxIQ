import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapCatalogNames } from "../catalog-names.ts";
import { buildAutomationStudioFlowBootstrapContext } from "../catalog.ts";
import { webDomainNodeDefinitionsFixture } from "./web-domain-definitions-fixture.ts";

// The names an evidence decision is shown in place of the whole catalog
// (t235, user 2026-10-01): every node, by id and description, by category.

describe("the node catalog by name", () => {
  it("lists every entry as `<id>: <description>` under its category, categories in first-appearance order of the id-sorted catalog", () => {
    const names = automationStudioFlowBootstrapCatalogNames([
      { id: "web.wait", category: "flow", description: "Wait for something." },
      { id: "web.click", category: "action", description: "Press a control." },
      { id: "web.extract", category: "output", description: "Read a list." },
      { id: "web.back", category: "flow", description: "Go back one page." }
    ]);

    expect(Object.keys(names)).toEqual(["flow", "action", "output"]);
    expect(names).toEqual({
      flow: ["web.back: Go back one page.", "web.wait: Wait for something."],
      action: ["web.click: Press a control."],
      output: ["web.extract: Read a list."]
    });
  });

  it("keeps a description whole, with its whitespace collapsed to single spaces", () => {
    const description = `First line,\n\tthen   a second;  ${"long ".repeat(80)}end.`;
    const names = automationStudioFlowBootstrapCatalogNames([{ id: "web.one", category: "web", description }]);

    expect(names.web).toEqual([`web.one: First line, then a second; ${"long ".repeat(80)}end.`]);
  });

  it("names every node of a real catalog, once", () => {
    const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
    const context = buildAutomationStudioFlowBootstrapContext({
      registry,
      resolution: { scope: { kind: "domain", domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] }
    });
    const lines = Object.values(automationStudioFlowBootstrapCatalogNames(context.nodeCatalog)).flat();

    expect(lines.length).toBe(context.nodeCatalog.length);
    expect(lines.map((line) => line.slice(0, line.indexOf(": "))).sort()).toEqual(context.nodeCatalog.map((entry) => entry.id).sort());
  });
});
