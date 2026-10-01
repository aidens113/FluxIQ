import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodeParameter, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA,
  buildAutomationStudioFlowBootstrapContext
} from "../index.ts";
import { webDomainNodeDefinitionsFixture } from "./web-domain-definitions-fixture.ts";

// What the model is shown when it has to write a filter, and whether it was
// shown all of it.
//
// **The run this pins.** On `run-muhubegx-9469de5e` a build was asked for the
// earbuds of a search result that were Plus eligible, rated 4.0 or higher, under
// $50, across every page, with sponsored placements and accessories left out and
// each pair listed once. It authored one filter condition and no pagination and
// returned 43 rows where 13 were wanted. The conclusion drawn beforehand was
// that the model had never been shown how to write the other five clauses. It
// had: the whole vocabulary was in the extraction node's own catalog entry, on
// every one of that build's 33 calls, uncut. These tests hold that true, and
// hold the two ways it could stop being true -- the character bound cutting the
// grammar, and a condensed entry dropping it -- to being *said* rather than
// silent.
//
// The grammar below is the web domain's own text on 2026-09-26, copied because
// Core never imports a domain. It is here as a realistic length and a realistic
// set of clauses, not as a contract: what is asserted is that this rendering
// carries whatever a domain wrote, whole, and names it when it cannot.

/** `WEB_AUTOMATION_EXTRACT_LIST_GRAMMAR`, 696 characters, as the domain wrote it on 2026-09-26. */
const EXTRACT_LIST_GRAMMAR = [
  `Detected: {handle: "extraction.N", fields?: {yourKey: "colKey"|"colKey@href"}, where?: [{field: "colKey", is: "absent"}, {field: "yourKey", atLeast: 4, lessThan: 50}], paginate?: false};`,
  "where is optional: omit it, keep every item, narrow later. All hold; also atMost/greaterThan/equals (number), contains/startsWith/endsWith/matches (text); list = any; not: true inverts.",
  "link = absolute URL, @href = raw href.",
  "Or {item: css, fields: {key: css|css@attribute|column:<header>}}.",
  "paginate?: {mode: next|loadMore|scroll|numbered, next|control|pages, maxPages|maxScrolls<=50}: pages to read, not pages present -- read only the page shown unless asked.",
  "minItems (default 1, 0 = none), maxItems <=1000."
].join(" ");

/**
 * The instruction's six qualifying clauses, each paired with the token of the
 * grammar that carries it.
 *
 * A clause deleted from a domain's grammar to make room for another is what
 * four campaigns of this text did, each time with the deletion argued in a
 * comment and recorded nowhere a run could see. These are the tokens a model
 * needs to have been shown to write that instruction's filter at all.
 */
const CLAUSE_VOCABULARY: ReadonlyArray<{ clause: string; token: string }> = [
  { clause: "is Brightaisle Plus eligible", token: `is: "absent"` },
  { clause: "rated 4.0 or higher", token: "atLeast" },
  { clause: "priced under $50", token: "lessThan" },
  { clause: "leave out sponsored placements", token: "not: true" },
  { clause: "no ear tips or charging cases", token: "contains" },
  { clause: "going through every page of results", token: "maxPages" }
];

const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

const INSTRUCTION = "Find every pair of wireless earbuds in the store's search results that is Brightaisle Plus eligible, "
  + "rated 4.0 or higher and priced under $50, going through every page of results. Leave out sponsored placements "
  + "and accessories such as ear tips or charging cases, list each pair only once even if it turns up on two pages, "
  + "and keep the order the search results show them in, with columns name, price, rating and url.";

const EXTRACTION_NODE_ID = "web.output.dom-extract_list";

/** The web domain's definitions, with the extraction node's grammar as it stands today. */
function definitionsWithGrammar(grammar: string): AutomationStudioNodeDefinition[] {
  return webDomainNodeDefinitionsFixture().map((definition) => definition.id !== EXTRACTION_NODE_ID
    ? definition
    : { ...definition, parameters: definition.parameters.map((parameter) => withGrammar(parameter, grammar)) });
}

function withGrammar(parameter: AutomationNodeParameter, grammar: string): AutomationNodeParameter {
  return parameter.id === "extractList" ? { ...parameter, description: grammar } : parameter;
}

function catalogAt(grammar: string = EXTRACT_LIST_GRAMMAR) {
  return buildAutomationStudioFlowBootstrapContext({
    registry: new AutomationStudioNodeRegistry(definitionsWithGrammar(grammar)),
    resolution,
    instructionText: INSTRUCTION
  });
}

function extractionEntry(context: ReturnType<typeof catalogAt>) {
  return context.nodeCatalog.find((entry) => entry.id === EXTRACTION_NODE_ID);
}

function extractListText(context: ReturnType<typeof catalogAt>): string | undefined {
  return extractionEntry(context)?.parameters.find((parameter) => parameter.id === "extractList")?.description;
}

// The catalog is every offered node, whole, with no byte budget (2026-09-30).
// Until then an evidence-guided build's catalog was fitted to about 42,000
// bytes, a first live bootstrap's to about 5,000, and a parameter description
// stopped at 900 characters.

describe("the vocabulary a model writes an extraction filter from", () => {
  it("reaches the model whole, for every clause of the instruction", () => {
    const context = catalogAt();

    expect(extractListText(context)).toBe(EXTRACT_LIST_GRAMMAR);
    for (const { clause, token } of CLAUSE_VOCABULARY) {
      expect(extractListText(context), `the clause "${clause}" has no vocabulary left in the catalog`).toContain(token);
    }
  });

  it("is sent with the request the value is written into, not held back for a later one", () => {
    const context = catalogAt();
    const entry = extractionEntry(context);

    expect(entry?.parameters.find((parameter) => parameter.id === "extractList")?.example).toBeDefined();
    expect(context.catalogSelection.withheldParameterText).toBeUndefined();
    // What that costs, so a change that doubles it is visible here rather than
    // in a bill: the entry, and the grammar as a share of it.
    expect(Buffer.byteLength(JSON.stringify(entry), "utf8")).toBeLessThanOrEqual(3_000);
    expect(Buffer.byteLength(JSON.stringify(context.nodeCatalog), "utf8")).toBe(context.catalogSelection.usedBytes);
  });

  it("reaches the model whole however long it is, with nothing named as withheld", () => {
    const grammar = `${EXTRACT_LIST_GRAMMAR} ${"More vocabulary. ".repeat(400)}`.trim();
    const context = catalogAt(grammar);
    expect(extractListText(context)).toBe(grammar);
    expect(context.catalogSelection.withheldParameterText).toBeUndefined();
  });
});

describe("what the last call before a build finishes tells the model", () => {
  const description = String(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_DRAFT_COMPLETION_SCHEMA.description);

  it("says a step that ran is still open to correction, and how", () => {
    expect(description).toContain("not settled");
    expect(description).toContain("amend_draft");
    expect(description).toContain("Read the instruction");
  });

  it("asks for a wider answer rather than an empty one, so narrowing is never a demand", () => {
    expect(description).toContain("Too wide an answer still finishes");
    expect(description).toContain("an empty one does not");
  });
});
