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
    // The schema's own words (`flow-draft/amendment/schema.ts`) say what the
    // merge does (`../rerun-input.ts`): a left-out key is kept, except in an
    // object the model writes out again, which drops what it was shown and left
    // out and keeps what was withheld from it (t287, W10).
    expect(input.description).toContain("a key left out is kept, except in an object you write out again");
    expect(input.description).toContain("drops the keys you were shown and left out, and keeps keys withheld from you");
    expect(input.description).toContain("a new key given a left-out key's value renames it");
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

// Live run `run-murdouox-c5294247`, the repair of a friend-requests listing whose
// columns were named by a detection's keys. Step 0047 renamed `mutual` to the
// instruction's `mutualFriends` by restating the map; the merge kept both, so the
// call that ran was not the one the model wrote, and its next, corrected rerun
// merged back into that same call and was refused as an exact repeat.
describe("a column a rerun writes under a new name", () => {
  const listing = (): JsonObject => ({
    node: "web.output.dom-extract_list",
    parameters: { extractList: { handle: "extraction.5", fields: { name: "kA", mutual: "kB", confirm: "kC" }, where: [{ field: "kB", matches: "x" }] } },
    consequences: []
  });
  const fieldsOf = (input: JsonObject): JsonObject => extractList(input).fields as JsonObject;

  it("is that column renamed when its value is the one of a column the patch leaves out", () => {
    const patch = { extractList: { handle: "extraction.5", fields: { name: "kA", mutualFriends: "kB", confirm: "kC" }, where: [{ field: "kB", matches: "x" }] } };
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), patch))).toEqual({ name: "kA", mutualFriends: "kB", confirm: "kC" });
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { parameters: patch }))).toEqual({ name: "kA", mutualFriends: "kB", confirm: "kC" });
    // 0051's map, which also left `confirm` out: the rename still holds, and,
    // with no denied keys declared, a column left out is kept; null removes it
    // (with them, a restated map drops it: "an object a rerun writes out again").
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { fields: { name: "kA", mutualFriends: "kB" } } })))
      .toEqual({ name: "kA", mutualFriends: "kB", confirm: "kC" });
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { fields: { mutualFriends: "kB", confirm: null } } })))
      .toEqual({ name: "kA", mutualFriends: "kB" });
  });

  it("keeps what the model could not see of a column it renamed, from the one stored column it restates", () => {
    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { label: shown(mark("data-ad-id", ".ad")) } } });
    expect(fieldsOf(input).label).toEqual(mark("data-ad-id", ".ad"));
    expect(fieldsOf(input)).not.toHaveProperty("ad");
    expect(fieldsOf(input).plus).toEqual(mark("aria-label", ".plus"));
  });

  it("is a new column when its value is no left-out column's, or more than one's", () => {
    // No column holds `kD`: an added column, every other kept.
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { fields: { price: "kD" } } })))
      .toEqual({ name: "kA", mutual: "kB", confirm: "kC", price: "kD" });
    // Three stored text columns read as `{kind: "text", required: true}`: which one is meant is not said, so none is renamed.
    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: { title: { kind: "text", required: true } } } });
    expect(Object.keys(fieldsOf(input))).toEqual(["name", "price", "rating", "plus", "ad", "title"]);
    // A column the patch writes again is not a source, even with the same value.
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { fields: { mutual: "kB", again: "kB" } } })))
      .toEqual({ name: "kA", mutual: "kB", confirm: "kC", again: "kB" });
  });

  it("renames only by a word: a number or a flag another key happens to hold is not a name", () => {
    const paged = (): JsonObject => ({ node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.1", paginate: { maxPages: 3 }, unique: true } }, consequences: [] });
    const input = automationStudioLlmEvidenceRerunInput(paged(), { extractList: { paginate: { maxScrolls: 3 }, dedupe: true } });
    expect(extractList(input).paginate).toEqual({ maxPages: 3, maxScrolls: 3 });
    expect(extractList(input)).toMatchObject({ unique: true, dedupe: true });
  });
});

// Live run `run-muwaobm2-882cadd9`, draft step 14: a quantity typing rerun as a
// click on the Spain row (decision 0052). The merge kept dom-type's `text` and
// `submit`, so every clean click the model wrote (0052, 0060-0092) ran as a
// click carrying `text: "3"`, and Core counted the quantity as set by it.
describe("a rerun that changes the step's node", () => {
  const typed = (): JsonObject => ({ node: "web.output.dom-type", parameters: { target: { handle: "t964" }, text: "3", submit: false }, consequences: [] });

  it("runs with the parameters the patch wrote, none of the old node's", () => {
    const patch = { node: "web.output.dom-click", parameters: { target: { handle: "t958" } }, consequences: [] };
    // Before: parameters { target: { handle: "t958" }, text: "3", submit: false }.
    expect(automationStudioLlmEvidenceRerunInput(typed(), patch)).toEqual(patch);
  });

  it("carries no old parameters when the patch writes none, and merges every other key as before", () => {
    expect(automationStudioLlmEvidenceRerunInput(typed(), { node: "web.output.dom-click" }))
      .toEqual({ node: "web.output.dom-click", consequences: [] });
  });

  it("merges as before when the node is the same", () => {
    expect(automationStudioLlmEvidenceRerunInput(typed(), { node: "web.output.dom-type", parameters: { text: "4" } }))
      .toEqual({ node: "web.output.dom-type", parameters: { target: { handle: "t964" }, text: "4", submit: false }, consequences: [] });
  });
});

// A map the model writes out again is what it says the map now holds. Live run
// `run-murdouox-c5294247` (R3): 0051 restated the columns as `{name,
// mutualFriends}`, leaving `confirm` out, and the merge kept it, so the call was
// the failed one again. Live run `run-mustvzvg-99695308` (C3): 0061 restated the
// refused read's `extractList` with its bound moved under `paginate`, and the
// merge kept the stray `extractList.maxPages: 10` the domain had refused, in
// every rerun after it (0063, 0070, 0073).
describe("an object a rerun writes out again", () => {
  const listing = (): JsonObject => ({
    node: "web.output.dom-extract_list",
    parameters: { extractList: { handle: "extraction.5", fields: { name: "kA", mutual: "kB", confirm: "kC" }, where: [{ field: "kB", matches: "x" }] } },
    consequences: []
  });
  const fieldsOf = (input: JsonObject): JsonObject => extractList(input).fields as JsonObject;
  const denied = ["selector"];

  it("drops a key the model was shown and left out of a map it restated", () => {
    // 0051's map: name repeated, mutual renamed, confirm left out.
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { fields: { name: "kA", mutualFriends: "kB" } } }, denied)))
      .toEqual({ name: "kA", mutualFriends: "kB" });
    // The same map, by the whole argument: the same columns.
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { handle: "extraction.5", fields: { name: "kA", mutualFriends: "kB" }, where: [{ field: "kB", matches: "x" }] } }, [])))
      .toEqual({ name: "kA", mutualFriends: "kB" });
  });

  it("keeps a key the screen withheld: the model could not have written it", () => {
    // The re-author's columns as the model read them, `ad` left out: every
    // column it wrote keeps its selector, and `ad`, which it saw, leaves.
    const fields = extractList(storedRead()).fields as JsonObject;
    const written = Object.fromEntries(["name", "price", "rating", "plus"].map((key) => [key, shown(fields[key] as JsonObject)]));
    const input = automationStudioLlmEvidenceRerunInput(storedRead(), { extractList: { fields: written } }, denied);
    expect(extractList(input).fields).toEqual({ name: text("h2 span"), price: text(".price"), rating: text(".stars"), plus: mark("aria-label", ".plus") });
    // A withheld key left out of a restated object is never dropped.
    const paged = { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.1", selector: "ul > li", minItems: 0, paginate: { maxPages: 2 } } } };
    expect(extractList(automationStudioLlmEvidenceRerunInput(paged, { extractList: { handle: "extraction.1", minItems: 0, paginate: { maxPages: 4 } } }, denied)))
      .toEqual({ handle: "extraction.1", selector: "ul > li", minItems: 0, paginate: { maxPages: 4 } });
  });

  it("drops the bound C3's rerun moved under paginate, from the refused attempt it restated", () => {
    const columns = { name: "kName", price: "kPrice", plus: "brightaisle_plus", ad: "data-ad-id" };
    const where = [{ field: "ad", is: "absent" }, { field: "name", contains: ["ear tips", "eartips"], not: true }];
    // Step 8 as stored: 0057's merged call, `maxPages` beside `paginate`.
    const refused = { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.3", fields: columns, where, paginate: { next: "a[rel=next]" }, minItems: 0, maxPages: 10 } }, consequences: [] };
    // 0061's patch, exactly as written.
    const patch = { extractList: { handle: "extraction.3", fields: columns, where, paginate: { mode: "next", next: "a[rel=next]", maxPages: 10 }, minItems: 0 } };

    const input = automationStudioLlmEvidenceRerunInput(refused, patch, denied);

    // Before: `extractList.maxPages: 10` stayed, and the domain refused the call again naming it.
    expect(extractList(input)).toEqual(patch.extractList);
    expect(input.consequences).toEqual([]);
  });

  it("is still a patch when it says less of the object than it leaves out, or changes what it names", () => {
    // A handle repeated beside one new key: the columns and conditions are kept.
    expect(extractList(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { handle: "extraction.5", dedupe: "url" } }, denied)))
      .toEqual({ ...extractList(listing()), dedupe: "url" });
    // One column repeated, one left out: as much said as left out, so nothing leaves.
    const two = { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.2", fields: { a: "kA", b: "kB" } } } };
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(two, { extractList: { fields: { a: "kA" } } }, denied))).toEqual({ a: "kA", b: "kB" });
    // A changed entry is not a repeat: a patch that changes two keys beside a repeated handle keeps what it leaves out.
    const stored = { node: "web.output.dom-extract_list", parameters: { extractList: { handle: "extraction.3", fields: { a: "kA" }, where: [], paginate: { maxPages: 1 }, minItems: 0 } } };
    expect(extractList(automationStudioLlmEvidenceRerunInput(stored, { extractList: { handle: "extraction.3", where: [{ field: "a", is: "present" }], paginate: { maxPages: 3 } } }, denied)))
      .toEqual({ handle: "extraction.3", fields: { a: "kA" }, where: [{ field: "a", is: "present" }], paginate: { maxPages: 3 }, minItems: 0 });
  });

  it("never reads the patch itself, or a node's parameters, as a restatement: those are the patch", () => {
    const typed = { node: "web.output.dom-type", parameters: { target: { handle: "t9" }, text: "3", submit: false, delay: 5 }, consequences: [] };
    expect(automationStudioLlmEvidenceRerunInput(typed, { target: { handle: "t9" }, text: "3", submit: true }, denied).parameters)
      .toEqual({ target: { handle: "t9" }, text: "3", submit: true, delay: 5 });
    expect(automationStudioLlmEvidenceRerunInput({ a: 1, b: 2, c: 3, d: 4 }, { a: 1, b: 2, c: 5 }, denied)).toEqual({ a: 1, b: 2, c: 5, d: 4 });
  });

  it("keeps every left-out key when the domain declared no denied keys: Core cannot tell what was withheld", () => {
    expect(fieldsOf(automationStudioLlmEvidenceRerunInput(listing(), { extractList: { fields: { name: "kA", mutualFriends: "kB" } } })))
      .toEqual({ name: "kA", mutualFriends: "kB", confirm: "kC" });
  });
});
