import { describe, expect, it } from "vitest";
import { deriveAutomationStudioPartCard } from "../derive-card.ts";
import type { AutomationStudioPartCardInput } from "../types.ts";
import { PAGE_TEXT, partGraphFixture } from "../../tests/fixtures.ts";

function input(overrides: Partial<AutomationStudioPartCardInput> & { graph?: AutomationStudioPartCardInput["graph"] } = {}): AutomationStudioPartCardInput {
  return { partId: "part.one", graph: partGraphFixture(), subflowName: "Search the shop", requestWords: "find me some shoes", ...overrides };
}

function derived(overrides: Parameters<typeof input>[0] = {}) {
  const result = deriveAutomationStudioPartCard(input(overrides));
  if ("skipped" in result) throw new Error(`skipped: ${result.skipped} ${result.detail ?? ""}`);
  return result;
}

describe("deriveAutomationStudioPartCard", () => {
  it("describes a part by its name, its ports, its exact sites and nothing more", () => {
    const { card, facets, searchable } = derived({ words: { purpose: "Look an item up in the shop" } });
    expect(card.name).toBe("Search the shop");
    expect(card.purpose).toBe("Look an item up in the shop");
    expect(card.sites).toEqual(["https://shop.example"]);
    expect(card.inputs).toEqual([{ id: "query", name: "Search words", required: true }]);
    expect(card.outputs).toEqual([{ id: "results", name: "Results found", required: false }]);
    expect(card.lastingClasses).toEqual([]);
    expect(card.calls).toEqual([]);
    expect(facets).toEqual({ site: ["https://shop.example"], input: ["query"], output: ["results"], lasting: [] });
    expect(searchable).toEqual({ name: "Search the shop", purpose: "Look an item up in the shop", ports: ["Search words", "Results found"] });
  });

  it("lets a person's words win over the Subflow's own, and never takes the bootstrap's generated description", () => {
    expect(derived({ words: { name: "Find a product" } }).card.name).toBe("Find a product");
    expect(derived({ subflowDescription: "Instruction-built graph for Search." }).card.purpose).toBe("Search the shop");
    expect(derived({ subflowDescription: "Looks things up" }).card.purpose).toBe("Looks things up");
    expect(derived({ subflowDescription: "Looks things up", words: { purpose: "Their own words" } }).card.purpose).toBe("Their own words");
  });

  it("carries no page text: not in the card, its full-text words, its facets or its hash inputs", () => {
    const result = derived({ startLocation: "https://shop.example/home?ref=PAGEWORD-start-query" });
    const shown = JSON.stringify([result.card, result.searchable, result.facets, result.callSites]);
    for (const text of Object.values(PAGE_TEXT)) expect(shown).not.toContain(text);
    expect(shown).not.toContain("secret-path-and-query");
    expect(shown).not.toContain("PAGEWORD");
    expect(shown).not.toContain("/catalogue");
    // The snapshot is the graph as saved, which is where a run reads the page evidence from.
    expect(JSON.stringify(result.snapshot)).toContain(PAGE_TEXT.controlText);
  });

  it("lists what a step types, and a control's words only when the person's request holds them too", () => {
    expect(derived().card.fixedValues).toEqual(["red shoes"]);
    // The domain says which words name a control; with none said, a control's text is neither listed nor compared.
    const words = (target: Record<string, unknown>) => {
      const fingerprint = target.fingerprint as { visibleText?: string } | undefined;
      return fingerprint?.visibleText ? [fingerprint.visibleText] : [];
    };
    const request = "press the PAGEWORD-button-Go-Fetch one";
    expect(derived({ requestWords: request }).card.fixedValues).toEqual(["red shoes"]);
    expect(derived({ requestWords: request, targetWords: words }).card.fixedValues).toEqual(["red shoes", PAGE_TEXT.buttonText]);
    expect(derived({ requestWords: "nothing like it", targetWords: words }).card.fixedValues).toEqual(["red shoes"]);
    expect(deriveAutomationStudioPartCard(input({ graph: partGraphFixture({ consequences: ["create_new"], typed: null }), requestWords: request, targetWords: words }))).toEqual({ skipped: "part.fixed_value_from_request" });
    expect(derived({ graph: partGraphFixture({ typed: null }) }).card.fixedValues).toEqual([]);
  });

  it("hashes the same for a copy under other ids and names, and for another fixed value, but not for another control", () => {
    const original = derived();
    const copy = derived({ graph: partGraphFixture({ renamed: true }) });
    expect(copy.card.shapeHash).toBe(original.card.shapeHash);
    const other = derived({ graph: partGraphFixture({ typed: "blue hats" }) });
    expect(other.card.shapeHash).toBe(original.card.shapeHash);
    expect(other.card.fixedValues).toEqual(["blue hats"]);
    expect(derived({ graph: partGraphFixture({ searchBoxId: "other-box" }) }).card.shapeHash).not.toBe(original.card.shapeHash);
    expect(derived({ graph: partGraphFixture({ consequences: ["create_new"] }) }).card.shapeHash).not.toBe(original.card.shapeHash);
  });

  it("refuses a lasting part that holds a literal from the person's request, and keeps the same part when nothing lasts", () => {
    const lasting = partGraphFixture({ consequences: ["create_new"] });
    expect(deriveAutomationStudioPartCard(input({ graph: lasting, requestWords: "add the red shoes to my cart" }))).toEqual({ skipped: "part.fixed_value_from_request" });
    const kept = derived({ graph: lasting, requestWords: "add something to my cart" });
    expect(kept.card.lastingClasses).toEqual(["create_new"]);
    expect(derived({ requestWords: "add the red shoes to my cart" }).card.fixedValues).toEqual(["red shoes"]);
  });

  it("refuses a part that holds a credential, wherever it sits", () => {
    expect(deriveAutomationStudioPartCard(input({ graph: partGraphFixture({ typed: ["sk", "live", "a1b2".repeat(8)].join("_") }) }))).toEqual({ skipped: "part.secret_shaped_value" });
    const graph = partGraphFixture();
    const typing = graph.nodes.find((node) => node.id.endsWith(".type"))!;
    typing.parameterValues = { ...typing.parameterValues, password: "hunter2" };
    expect(deriveAutomationStudioPartCard(input({ graph }))).toEqual({ skipped: "part.secret_shaped_value" });
  });

  it("fails closed on a step nobody classified, and on a declaration it cannot read", () => {
    expect(deriveAutomationStudioPartCard(input({ graph: partGraphFixture({ consequences: null }) }))).toEqual({ skipped: "part.unclassified_step", detail: "a.nav" });
    expect(deriveAutomationStudioPartCard(input({ graph: partGraphFixture({ consequences: ["spend_my_money"] }) }))).toEqual({ skipped: "part.unreadable_consequences", detail: "a.nav" });
    const marked = partGraphFixture();
    marked.nodes[0]!.metadata = { declaredConsequences: [], destructive: true };
    expect(deriveAutomationStudioPartCard(input({ graph: marked }))).toEqual({ skipped: "part.unclassified_step", detail: "a.nav" });
  });

  it("reads lasting classes through the parts it calls, and refuses a call it cannot read", () => {
    const graph = partGraphFixture();
    graph.nodes.push({ id: "a.call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "subflow.helper" }, metadata: {} });
    graph.edges.push({ id: "a.edge.call", sourceNodeId: "a.click", targetNodeId: "a.call", sourcePortId: "success", targetPortId: "in" });
    expect(deriveAutomationStudioPartCard(input({ graph }))).toEqual({ skipped: "part.unresolved_call", detail: "a.call" });
    const callee = { partId: "part.helper", version: 2, shapeHash: "1".repeat(64), lastingClasses: ["send_or_publish" as const], sites: ["https://other.example"] };
    const result = derived({ graph, callees: { "subflow.helper": callee } });
    expect(result.card.lastingClasses).toEqual(["send_or_publish"]);
    expect(result.card.calls).toEqual([{ partId: "part.helper", version: 2 }]);
    expect(result.card.sites).toEqual(["https://other.example", "https://shop.example"]);
    expect(result.callSites).toEqual([{ nodeId: "a.call", partId: "part.helper", version: 2 }]);
  });

  it("writes the start and end checks into the snapshot and gives the card their digests", () => {
    const entry = partGraphFixture({
      firstStep: "type",
      metadata: { "fluxiq.successCheck": [{ fact: "host.done", op: "exists" }] }
    });
    entry.nodes[0]!.metadata = { declaredConsequences: [], "fluxiq.entry": { id: "ready", order: 1, when: [{ fact: "host.ready", op: "visible" }], requires: [] } };
    const declared = derived({ graph: entry });
    expect(declared.snapshot.start).toEqual({ source: "entry", conditions: [{ fact: "host.ready", op: "visible" }] });
    expect(declared.snapshot.end.conditions).toEqual([{ fact: "host.done", op: "exists" }]);
    expect(declared.card.startCheck).toMatchObject({ conditions: 1 });
    expect(declared.card.endCheck).toMatchObject({ conditions: 1 });
    expect(declared.card.startCheck?.digest).toMatch(/^[a-f0-9]{64}$/u);

    const typing = derived({ graph: partGraphFixture({ firstStep: "type" }) });
    expect(typing.snapshot.start.source).toBe("first_step");
    expect(typing.snapshot.start.conditions).toHaveLength(1);
    expect(typing.snapshot.start.conditions[0]).toMatchObject({ fact: "exists", op: "exists" });
    expect(typing.card.endCheck).toBeUndefined();
  });

  it("marks a part whose first step navigates as bringing its own page, with no start check, and one with no way to start as having none", () => {
    const navigating = derived();
    expect(navigating.snapshot.start).toEqual({ source: "navigate", conditions: [], selfArrives: true });
    expect(navigating.card.startCheck).toBeUndefined();
    const unbound = partGraphFixture();
    unbound.nodes[0]!.parameterValues = { url: { $state: { path: "address" } } };
    const none = derived({ graph: unbound });
    expect(none.snapshot.start).toEqual({ source: "none", conditions: [] });
  });

  it("skips a part with nothing that acts, a name that is not words, and an unreadable contract", () => {
    const empty = partGraphFixture();
    empty.nodes = [{ id: "a.set", definitionId: "builtin.data.set-variable" }];
    empty.edges = [];
    expect(deriveAutomationStudioPartCard(input({ graph: empty }))).toEqual({ skipped: "part.no_acting_step" });
    expect(deriveAutomationStudioPartCard(input({ subflowName: "<div class=\"x\">", words: { name: "https://shop.example/a" } }))).toEqual({ skipped: "part.name_unusable" });
    const broken = partGraphFixture({ metadata: { "fluxiq.successCheck": "not a list" } });
    expect(deriveAutomationStudioPartCard(input({ graph: broken })).hasOwnProperty("skipped")).toBe(true);
  });
});
