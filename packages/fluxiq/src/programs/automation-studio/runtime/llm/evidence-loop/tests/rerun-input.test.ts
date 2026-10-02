// A rerun carries only what changes in the step's argument (t211): the reply
// that asks for it stays short and shallow, which is where the unreadable
// replies of lane C's live runs came from (`../rerun-input.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceRerunInput } from "../rerun-input.ts";
import { automationStudioLlmEvidenceRerunRequest } from "../rerun-request.ts";

// The shape of the list read whose reruns came back unreadable: a node, its
// columns, its conditions and its paging, three and four levels deep.
const listRead = (): JsonObject => ({
  node: "web.output.dom-extract_list",
  parameters: {
    rows: { selector: "ul.results > li" },
    columns: [{ name: "title", selector: "h3" }, { name: "price", selector: ".price" }],
    where: [{ column: "title", contains: "earbuds" }],
    paging: { next: { selector: "a[rel=next]" }, maxPages: 5 }
  },
  consequences: []
});

describe("the argument a rerun runs with", () => {
  it("is the step's argument with only the keys the rerun changed", () => {
    const previous = listRead();
    const input = automationStudioLlmEvidenceRerunInput(previous, { parameters: { paging: { maxPages: 10 } } });

    expect(input).toEqual({ ...listRead(), parameters: { ...listRead().parameters as JsonObject, paging: { next: { selector: "a[rel=next]" }, maxPages: 10 } } });
    // The step's own argument is not touched.
    expect(previous).toEqual(listRead());
  });

  it("replaces a list whole, and removes a key given as null", () => {
    const input = automationStudioLlmEvidenceRerunInput(listRead(), { parameters: { where: [{ column: "price", below: 50 }], paging: null } });

    expect((input.parameters as JsonObject).where).toEqual([{ column: "price", below: 50 }]);
    expect(input.parameters).not.toHaveProperty("paging");
    expect((input.parameters as JsonObject).columns).toEqual((listRead().parameters as JsonObject).columns);
  });

  it("is exactly the whole argument when the rerun still sends one", () => {
    const whole = { ...listRead(), parameters: { ...listRead().parameters as JsonObject, rows: { selector: "ol > li" } } };
    expect(automationStudioLlmEvidenceRerunInput(listRead(), whole)).toEqual(whole);
  });

  it("is what the loop runs: the rerun call carries the merged argument through the step's tool", () => {
    const step: AutomationStudioFlowDraftStep = { position: 3, id: "d3", iteration: 3, actionId: "web.output.dom-extract_list", toolId: "core.run_node", input: listRead(), effect: "observe", disposition: "kept" };

    const resolved = automationStudioLlmEvidenceRerunRequest([{ step: 3, change: "rerun", input: { parameters: { rows: { selector: "ol > li" } } } }], [step], new Set(["core.run_node"]));

    expect(resolved.request).toEqual({
      step: 3, toolId: "core.run_node", callId: "rerun.3",
      input: { ...listRead(), parameters: { ...listRead().parameters as JsonObject, rows: { selector: "ol > li" } } }
    });
  });

  it("is what the model is told to write: only the keys that change", () => {
    const input = (AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>).input!;
    expect(input.description).toContain("JSON merge patch over the argument the step ran with");
    expect(input.description).toContain("Only the keys that change");
    expect(input.description).toContain("null removes a key");
    // Either shape the re-author wrote is one the merge reads (t194-w39).
    expect(input.description).toContain("a node's parameters may be written without parameters around them");
  });
});

// Live run 12 (`run-muq66ff9-cb3767a1`), the re-author's reruns of its list read:
// the step is the Flow's own node, selectors and all, and the model reads it with
// every `selector` withheld.
const text = (selector: string): JsonObject => ({ kind: "text", selector, required: true });
const mark = (attribute: string, selector: string): JsonObject => ({ kind: "attribute", attribute, selector, required: false });
const storedRead = (): JsonObject => ({
  node: "web.output.dom-extract_list",
  parameters: {
    extractList: {
      item: "div.card",
      fields: { name: text("h2 span"), price: text(".price"), rating: text(".stars"), plus: mark("aria-label", ".plus"), ad: mark("data-ad-id", ".ad") },
      where: [
        { read: mark("data-ad-id", ".ad"), is: "absent" },
        { read: mark("aria-label", ".plus"), is: "present" },
        { read: text(".stars"), atLeast: 4 },
        { read: text(".price"), lessThan: 50 },
        { read: text("h2 span"), contains: ["ear tips"], not: true }
      ],
      paginate: { next: "nav a.next", maxPages: 5 }
    }
  }
});
// What the model was shown of a column: the column without its selector.
const shown = (column: JsonObject): JsonObject => Object.fromEntries(Object.entries(column).filter(([key]) => key !== "selector")) as JsonObject;
const extractList = (input: JsonObject): JsonObject => (input.parameters as JsonObject).extractList as JsonObject;

describe("a rerun patch, in the shape the re-author wrote it", () => {
  it("is read as the node's parameters when it names none of node, parameters or consequences", () => {
    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { paginate: { maxPages: 11 } } });

    // Before: a third top-level key, refused unexpected_input_keys by the caller.
    expect(Object.keys(input).sort()).toEqual(["node", "parameters"]);
    expect(extractList(input).paginate).toEqual({ next: "nav a.next", maxPages: 11 });
    expect(input).toEqual(automationStudioLlmEvidenceRerunInput(storedRead(), { parameters: { extractList: { paginate: { maxPages: 11 } } } }));
    // Read as written when it names one of them -- a mixed patch still reaches
    // the caller, which refuses it with the keys a call takes -- or when the
    // argument is no node's.
    const mixed = automationStudioLlmEvidenceRerunInput(storedRead(), { parameters: {}, extractList: {} });
    expect(Object.keys(mixed).sort()).toEqual(["extractList", "node", "parameters"]);
    expect(automationStudioLlmEvidenceRerunInput({ target: "#a" }, { target: "#b" })).toEqual({ target: "#b" });
  });
});

describe("a list a rerun rewrites", () => {
  it("keeps each condition's withheld selector, from the stored condition it restates", () => {
    const stored = extractList(storedRead()).where as JsonObject[];
    // Exactly what the model could write: the conditions as it read them.
    const where: JsonObject[] = stored.map((condition) => ({ ...condition, read: shown(condition.read as JsonObject) }));

    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { parameters: { extractList: { where, paginate: { maxPages: 11 } } } });

    // Before: every read lost its selector and read the card's root.
    expect(extractList(input).where).toEqual(stored);
  });

  it("finds the condition it restates by its keys when the model put a new one in front", () => {
    const stored = extractList(storedRead()).where as JsonObject[];
    const where = [{ read: shown(text(".stars")), atMost: 5 }, ...stored.map((condition) => ({ ...condition, read: shown(condition.read as JsonObject) }))];

    const read = extractList(automationStudioLlmEvidenceRerunInput(storedRead(), { parameters: { extractList: { where } } })).where as JsonObject[];

    // rating's atLeast keeps rating's selector and price's lessThan keeps price's,
    // though both stand one place later than they were stored.
    expect(read.slice(1)).toEqual(stored);
    // The new one restates three stored text conditions, none with its keys, and
    // the list changed length: nothing settles which, so it runs as written.
    expect(read[0]).toEqual({ read: shown(text(".stars")), atMost: 5 });
  });

  it("takes a column the same patch changed by its key, when the condition changed with it", () => {
    const stored = extractList(storedRead()).where as JsonObject[];
    const where: JsonObject[] = stored.map((condition) => ({ ...condition, read: shown(condition.read as JsonObject) }));
    where[1] = { read: { kind: "attribute", attribute: "alt", required: false }, is: "present" };

    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { parameters: { extractList: { fields: { plus: { attribute: "alt" } }, where } } });

    expect((extractList(input).where as JsonObject[])[1]).toEqual({ read: mark("alt", ".plus"), is: "present" });
  });

  it("leaves out a key the item itself left out: the model saw that one", () => {
    const stored = extractList(storedRead()).where as JsonObject[];
    const where: JsonObject[] = stored.map((condition) => ({ ...condition, read: shown(condition.read as JsonObject) }));
    where[4] = { read: shown(text("h2 span")), contains: ["ear tips"] };

    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { parameters: { extractList: { where } } });

    expect((extractList(input).where as JsonObject[])[4]).toEqual({ read: text("h2 span"), contains: ["ear tips"] });
  });
});

// Cause 6a of the same run: the re-author turned the ad mark into a text column,
// and the merge kept the attribute only an attribute column takes.
describe("a patch that changes a column's kind", () => {
  const fields = (input: JsonObject): JsonObject => extractList(input).fields as JsonObject;

  it("drops the old kind's own member and keeps what the model could not see", () => {
    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { ad: { kind: "text" } } } });

    // Before: { kind: "text", attribute: "data-ad-id", selector: ".ad", required: false }.
    expect(fields(input).ad).toEqual({ kind: "text", selector: ".ad", required: false });
    // The other columns are untouched.
    expect(fields(input).plus).toEqual(mark("aria-label", ".plus"));
  });

  it("gives a condition rewritten against the changed column that column as it now stands", () => {
    const stored = extractList(storedRead()).where as JsonObject[];
    const where: JsonObject[] = stored.map((condition) => ({ ...condition, read: shown(condition.read as JsonObject) }));
    where[0] = { read: { kind: "text", required: false }, is: "absent" };

    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { ad: { kind: "text" } }, where } });

    expect((extractList(input).where as JsonObject[])[0]).toEqual({ read: { kind: "text", selector: ".ad", required: false }, is: "absent" });
  });

  it("keeps the member when the kind stays, when the patch writes it, and drops none the new kind's change does not name", () => {
    // The same kind: an ordinary merge.
    expect(fields(automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { ad: { kind: "attribute", required: true } } } })).ad)
      .toEqual({ kind: "attribute", attribute: "data-ad-id", selector: ".ad", required: true });
    // Into a kind that owns a member, written with it.
    expect(fields(automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { name: { kind: "attribute", attribute: "title" } } } })).name)
      .toEqual({ kind: "attribute", attribute: "title", selector: "h2 span", required: true });
    // Out of a kind that owns none: every stored member merges as before.
    expect(fields(automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { name: { kind: "link" } } } })).name)
      .toEqual({ kind: "link", selector: "h2 span", required: true });
    // The old kind's member written again in the same patch is the patch's.
    expect(fields(automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { ad: { kind: "image", attribute: "src" } } } })).ad)
      .toEqual({ kind: "image", attribute: "src", selector: ".ad", required: false });
  });
});
