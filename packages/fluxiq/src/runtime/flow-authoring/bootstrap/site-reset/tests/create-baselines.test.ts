import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetCreateBaselines } from "../create-baselines.ts";
import type { AutomationStudioSiteResetDeclared, AutomationStudioSiteResetRead } from "../contracts.ts";
import { automationStudioSiteResetPageCollection as pageCollection } from "../page-collection.ts";

const original = (resource = "r:one"): AutomationStudioSiteResetRead => ({ state: {}, differs: [], scope: "p:destination-page", resource, collections: [
  { scope: "p:destination", group: "g:destination", subjects: ["s:existing"], states: { "s:existing": "v:original" } },
  { scope: "p:sibling", group: "g:destination", subjects: [], states: {} }
] });
const create = (over: Partial<AutomationStudioSiteResetDeclared["control"]> = {}): AutomationStudioSiteResetDeclared => ({ permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: null, kind: null, subject: "s:document", scope: "p:source", resource: "r:one", ...over }, verb: "press" });
// t775: the exploration door no longer refuses a press for want of a witness; it admits it with none.
const REFUSED = { kind: "admit" };

describe("build-only original creation receipts", () => {
  it("issues closed refs from the actual complete observation, then accepts only its same-resource absent subject", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    expect(baseline.check(create(), undefined)).toMatchObject(REFUSED);
    baseline.observed(original());
    expect(baseline.receipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 1 }, { ref: "destination-2", ordinal: 2, count: 0 }]);
    expect(baseline.check(create(), "destination-1")).toEqual({ kind: "admit" });
    for (const ref of [undefined, "p:destination", "destination-999", {}, ["destination-1"]]) expect(baseline.check(create(), ref)).toMatchObject(REFUSED);
    expect(baseline.check(create({ resource: "r:foreign" }), "destination-1")).toMatchObject(REFUSED);
    const unbound = create();
    delete unbound.control.resource;
    expect(baseline.check(unbound, "destination-1")).toMatchObject(REFUSED);
    expect(baseline.check(create({ subject: "s:existing" }), "destination-1")).toMatchObject(REFUSED);
    // The page fallback cannot hide a pre-existing subject when a source has no item.
    expect(baseline.check(create({ page: "s:existing" }), "destination-1")).toMatchObject(REFUSED);
  });

  it("retains exact same-scope positive authority without a guessed destination", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(original());
    expect(baseline.check(create({ scope: "p:destination" }), undefined)).toEqual({ kind: "admit" });
    expect(baseline.check(create({ scope: "p:same-page-other-list" }), undefined)).toMatchObject(REFUSED);
  });

  it("never mints authority from missing-resource or first post-effect observations", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    const unbound = original();
    delete unbound.resource;
    baseline.observed(unbound);
    expect(baseline.receipts()).toEqual([]);
    baseline.seal();
    baseline.observed(original());
    expect(baseline.receipts()).toEqual([]);
    expect(baseline.check(create(), "destination-1")).toMatchObject(REFUSED);
  });

  it("does not create an original from an update routed with baseline=false", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(original(), false);
    expect(baseline.receipts()).toEqual([]);
  });

  it("keeps original authority immutable across later valid reads and protects pre-existing subjects", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(original());
    baseline.seal();
    const after = original();
    after.collections![0]!.subjects.push("s:document");
    after.collections![0]!.states["s:document"] = "v:created";
    baseline.observed(after);
    expect(baseline.receipts()[0]).toEqual({ ref: "destination-1", ordinal: 1, count: 1 });
    expect(baseline.check(create(), "destination-1")).toEqual({ kind: "admit" });
    expect(baseline.check(create({ subject: "s:existing" }), "destination-1")).toMatchObject(REFUSED);
  });

  it("invalidates stale positive admission on malformed or reduced sibling groups, then allows a fresh complete retry", () => {
    for (const corrupt of [
      (read: AutomationStudioSiteResetRead) => { read.collections![0]!.states = {}; },
      (read: AutomationStudioSiteResetRead) => { read.collections![0]!.subjects.push("s:existing"); },
      (read: AutomationStudioSiteResetRead) => { read.collections!.push(structuredClone(read.collections![0]!)); },
      (read: AutomationStudioSiteResetRead) => { read.collections!.pop(); },
      (read: AutomationStudioSiteResetRead) => { delete read.collections; },
      (read: AutomationStudioSiteResetRead) => { read.collections = []; }
    ]) {
      const baseline = new AutomationStudioSiteResetCreateBaselines();
      baseline.observed(original());
      baseline.receipts();
      const bad = original();
      corrupt(bad);
      baseline.observed(bad);
      expect(baseline.receipts()).toEqual([]);
      expect(baseline.check(create(), "destination-1")).toMatchObject(REFUSED);
      baseline.observed(original());
      expect(baseline.check(create(), "destination-1")).toEqual({ kind: "admit" });
    }
  });

  it("preserves a destination witness during safe observation of a different page", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(original());
    baseline.receipts();
    baseline.observed({ state: {}, differs: [], scope: "p:source", resource: "r:one", collections: [] });
    expect(baseline.receipts()).toEqual([]);
    expect(baseline.check(create(), "destination-1")).toEqual({ kind: "admit" });
    baseline.observed({ state: {}, differs: [], scope: "p:destination-page", resource: "r:foreign", collections: [] });
    expect(baseline.check(create(), "destination-1")).toEqual({ kind: "admit" });
  });

  it("bounds printed refs and never admits an unissued reference", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    const read = original();
    read.collections = Array.from({ length: 40 }, (_, index) => ({ scope: `p:list-${index}`, group: "g:many", subjects: [], states: {} }));
    baseline.observed(read);
    expect(baseline.receipts()).toHaveLength(32);
    expect(baseline.check(create(), "destination-33")).toMatchObject(REFUSED);
  });

  it("names the original destination a creation is admitted against, and none where it is refused (F1)", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    expect(baseline.destination(create(), undefined)).toBeUndefined();
    baseline.observed(original());
    baseline.receipts();
    expect(baseline.destination(create(), "destination-1")).toEqual({ scope: "p:destination", group: "g:destination" });
    expect(baseline.destination(create(), "destination-2")).toEqual({ scope: "p:sibling", group: "g:destination" });
    expect(baseline.destination(create({ scope: "p:destination" }), undefined)).toEqual({ scope: "p:destination", group: "g:destination" });
    // Any reversible act may name where its effect would show, by an issued ref only (F1 continuation).
    const modify = { ...create(), consequences: ["modify_existing" as const] };
    expect(baseline.destination(modify, "destination-1")).toEqual({ scope: "p:destination", group: "g:destination" });
    expect(baseline.destination({ ...create(), consequences: ["delete" as const] }, "destination-2")).toEqual({ scope: "p:sibling", group: "g:destination" });
    for (const [declared, ref] of [
      [create(), undefined], [create(), "destination-999"], [create({ resource: "r:foreign" }), "destination-1"],
      [create({ subject: "s:existing" }), "destination-1"], [modify, undefined], [{ ...modify, control: { ...modify.control, scope: "p:destination" } }, undefined],
      [modify, "destination-999"], [{ ...modify, control: { ...modify.control, resource: "r:foreign" } }, "destination-1"],
      [{ ...create(), consequences: ["send_or_publish" as const] }, "destination-1"], [{ ...create(), consequences: ["modify_existing" as const, "move_money" as const] }, "destination-1"],
      [{ ...modify, effect: "observe" as const }, "destination-1"]
    ] as const) expect(baseline.destination(declared, ref)).toBeUndefined();
    // A destination whose fresh read is malformed admits nothing, and names nothing.
    const bad = original();
    bad.collections![0]!.subjects.push("s:existing");
    baseline.observed(bad);
    expect(baseline.destination(create(), "destination-1")).toBeUndefined();
  });

  it("preserves observation, unclassified, ordinary modifications and irreversible/mixed policy", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    // A creation that names nothing at all keeps its legacy policy; one in a list scope is held to the witness rule (t748, reset-witness.test.ts).
    const unidentified = create();
    delete unidentified.control.subject;
    delete unidentified.control.page;
    delete unidentified.control.scope;
    for (const declaration of [
      { ...create(), effect: "observe" as const },
      unidentified,
      { ...create(), consequences: [] },
      // A modification on a stated toggle has a witness before the seal (`../reset-witness.ts`); one with none is refused (reset-witness.test.ts).
      { ...create({ place: "pl:star", state: "st:off" }), consequences: ["modify_existing" as const] },
      { ...create(), consequences: ["send_or_publish" as const] },
      { ...create(), consequences: ["move_money" as const] },
      { ...create(), consequences: ["create_new" as const, "send_or_publish" as const] }
    ]) expect(baseline.check(declaration, undefined)).toEqual({ kind: "admit" });
  });
});

// Office rounds 2 and 4 (t748, C5): a creation's refusal printed beside it only the lists of the page it was pressed on,
// and the builder named a list of other items suggested beside the subject, which nothing the creation makes ever joins.
// By what Core reads -- list place, the act's subject and page, groups, the original's subjects -- such a list has the
// same shape as one a creation on its own page does join: a note added under a recipe joins the notes list there. So
// Core accepts both, and the refusal says which lists were read on this page and which elsewhere, and which list to name.
describe("a creation's destination on its own page (t748)", () => {
  const states = (subjects: string[]) => Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`]));
  const recipePage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: "r:recipes", scope: "p:recipe-page", location: "loc:recipe", collections: [
    { scope: "p:notes", group: "g:recipe", subjects: ["s:note-1"], states: states(["s:note-1"]) },
    { scope: "p:similar", group: "g:recipe", subjects: ["s:soup", "s:stew", "s:bread"], states: states(["s:soup", "s:stew", "s:bread"]) }
  ] });
  const planPage = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: "r:recipes", scope: "p:plan-page", location: "loc:week", collections: [
    { scope: "p:plan", group: "g:plan", subjects: ["s:salad"], states: states(["s:salad"]) }
  ] });
  /** A control about the recipe on its own page, in no list: "Add a note", "Add to meal plan". */
  const onRecipe = create({ subject: "s:pie", page: "s:pie", scope: "p:recipe-page", resource: "r:recipes" });

  it("still accepts a list on the creation's own page, which a creation pressed there can join", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(recipePage());
    expect(baseline.receipts().map((receipt) => receipt.ref)).toEqual(["destination-1", "destination-2"]);
    expect(baseline.check(onRecipe, "destination-1")).toEqual({ kind: "admit" });
    expect(baseline.destination(onRecipe, "destination-1")).toEqual({ scope: "p:notes", group: "g:recipe" });
    // The list of suggested recipes has the same shape by everything Core reads, so it is not refused (report, C5).
    expect(baseline.check(onRecipe, "destination-2")).toEqual({ kind: "admit" });
  });

  it("is admitted at the exploration door with no witness (t775): nothing asks for a list read before the creation", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(planPage());
    baseline.receipts();
    baseline.observed(recipePage());
    baseline.receipts();
    expect(baseline.check(onRecipe, undefined)).toEqual({ kind: "admit" });
    expect(baseline.destination(onRecipe, undefined)).toBeUndefined();
  });
});

// t751 (R1, R3): the global seal is replaced by a per-group one, and `check` is the exploration door of the one admission
// (`../../reset-admission/`), asked every time. Made-up fixtures: a gallery's walls and a print's own page.
describe("per-group seal and the admission port (t751)", () => {
  const SITE = "r:gallery";
  const wall = (group: string, scope: string, resource = SITE): AutomationStudioSiteResetRead => ({ state: {}, differs: [], scope: `p:${group}-page`, resource, location: `loc:${group}`, collections: [
    { scope, group, subjects: ["s:sketch"], states: { "s:sketch": "v:sketch" } }
  ] });
  const pin = (over: Partial<AutomationStudioSiteResetDeclared["control"]> = {}, consequences: AutomationStudioSiteResetDeclared["consequences"] = ["modify_existing"]): AutomationStudioSiteResetDeclared => ({ permitted: true, effect: "mutate", consequences, control: { name: null, kind: null, subject: "s:print", page: "s:print", scope: "p:print-page", resource: SITE, ...over }, verb: "press" });
  // t775: admitted at the exploration door with no witness.
  const WITNESS = { kind: "admit" };

  it("a list first read after an act that touched another group still becomes an original and issues a ref", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(wall("g:east", "p:east"));
    baseline.receipts();
    baseline.touch(["g:east"]);
    baseline.observed(wall("g:west", "p:west"));
    expect(baseline.receipts()).toEqual([{ ref: "destination-2", ordinal: 1, count: 1 }]);
    expect(baseline.check(pin(), "destination-2")).toEqual({ kind: "admit" });
  });

  it("one first read in a touched group does not, and the originals already there stay as they were", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.touch(new Set(["g:west"]));
    baseline.observed(wall("g:west", "p:west"));
    expect(baseline.receipts()).toEqual([]);
    expect(baseline.check(pin(), "destination-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.reset_destination_unissued" } });
    const kept = new AutomationStudioSiteResetCreateBaselines();
    kept.observed(wall("g:east", "p:east"));
    kept.touch(["g:east"]);
    kept.observed(wall("g:east", "p:east"));
    expect(kept.receipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 1 }]);
  });

  it("an act of unknown location still seals every group", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.seal();
    baseline.observed(wall("g:west", "p:west"));
    expect(baseline.receipts()).toEqual([]);
  });

  it("after an earlier lasting act a press with no witness is still refused (the seal no longer admits it)", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    expect(baseline.check(pin(), undefined)).toMatchObject(WITNESS);
    baseline.seal();
    expect(baseline.check(pin(), undefined)).toMatchObject(WITNESS);
    expect(baseline.check({ ...pin({}, ["create_new"]), control: { name: null, kind: null, item: "i:untitled", page: "s:print", scope: "p:print-page", resource: SITE } }, undefined)).toMatchObject(WITNESS);
    // And a creation with no original at all is met on another page, never by no call (t751: a list can always still be read).
    expect(baseline.check(pin({}, ["create_new"]), undefined)).toEqual({ kind: "admit" });
  });

  it("admits a press that repeats a witnessed explored act, through the explored acts it is handed", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    const explored = (witnessed: boolean) => () => [{ id: "act-1", consequences: ["modify_existing" as const], operation: "gallery.pin", spot: { subject: "s:print", page: "s:print", resource: SITE }, witnessed }];
    expect(baseline.check(pin(), undefined, explored(true))).toEqual({ kind: "admit" });
    expect(baseline.check(pin(), undefined, explored(false))).toMatchObject(WITNESS);
  });

  it("hands the admission its part of the port: refs with destinations and originals, issued refs and this read's refs", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    const known = baseline.known();
    expect(known.unissued(undefined)).toBe(false);
    expect(known.unissued("destination-1")).toBe(true);
    baseline.observed(wall("g:east", "p:east"));
    expect(known.here()).toEqual(["destination-1"]);
    expect(known.issuedRefs()).toEqual([]);
    baseline.receipts();
    expect(known.unissued("destination-1")).toBe(false);
    expect(known.issuedRefs()).toEqual([{ ref: "destination-1", count: 1, location: "loc:g:east" }]);
    expect(known.destination(pin(), "destination-1")).toEqual({ ref: "destination-1", scope: "p:east", group: "g:east" });
    expect(known.destination(pin(), undefined)).toBeUndefined();
    expect(known.destination(pin({ scope: "p:east" }, ["create_new"]), undefined)).toEqual({ ref: "destination-1", scope: "p:east", group: "g:east" });
    expect(known.original("p:east", SITE)).toEqual({ scope: "p:east", group: "g:east" });
    expect(known.original("p:east", "r:elsewhere")).toBeUndefined();
    expect(known.original("p:west", SITE)).toBeUndefined();
    baseline.observed({ state: {}, differs: [], scope: "p:print-page", resource: SITE, collections: [] });
    expect(known.here()).toEqual([]);
  });
});

// A page read whole is a destination (t791 fix 1): a read naming its page and the subjects it shows, with no list the domain
// vouches for, issues a page ref; a read that carries lists issues exactly the refs it did before. Made-up fixtures: a
// library's reading shelf, opaque tokens.

const SITE = "r:library-tab-1";
const SHELF = "loc:shelf";
/** The reading shelf: its books in plain blocks (no list the domain vouches for), or none at all (an empty state). */
const shelf = (subjects: string[], over: Partial<AutomationStudioSiteResetRead> = {}): AutomationStudioSiteResetRead => ({ state: { page: "shelf" }, differs: [], location: SHELF, scope: "p:shelf-page", resource: SITE, subjects, ...over });
/** The same shelf drawn as a list the domain vouches for. */
const listed = (): AutomationStudioSiteResetRead => shelf(["s:atlas"], { collections: [{ scope: "p:shelf-list", group: "g:shelf-list", subjects: ["s:atlas"], states: { "s:atlas": "v:one-copy" } }] });

describe("a page read whole issues a page ref (t791)", () => {
  it("issues a ref for an empty-state page, printed as a page, holding nothing", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(shelf([]));
    expect(baseline.receipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 0, page: true }]);
    expect(baseline.issuedRefs()).toEqual([{ ref: "destination-1", count: 0, location: SHELF }]);
  });

  it("issues a ref for a page whose items sit in plain blocks, counting the subjects it shows", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(shelf(["s:atlas", "s:herbal", "s:atlas"]));
    expect(baseline.receipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 2, page: true }]);
  });

  it("leaves the refs of a read carrying lists unchanged: no page ref beside them", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(listed());
    expect(baseline.receipts()).toEqual([{ ref: "destination-1", ordinal: 1, count: 1 }]);
    expect(baseline.issuedRefs()).toEqual([{ ref: "destination-1", count: 1, location: SHELF }]);
  });

  it("issues none for a read with no subjects, no page scope, or no trusted resource", () => {
    const without = (key: "subjects" | "scope" | "resource"): AutomationStudioSiteResetRead => {
      const read = shelf([]);
      delete read[key];
      return read;
    };
    for (const read of [without("subjects"), without("scope"), without("resource"), shelf([], { resource: "not a token" }), shelf(["s:atlas", "not a token"])]) {
      const baseline = new AutomationStudioSiteResetCreateBaselines();
      baseline.observed(read);
      expect(baseline.receipts()).toEqual([]);
    }
  });

  it("keeps reading a page with an original once lists appear on it, and its ref stays the same", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(shelf([]));
    baseline.receipts();
    baseline.observed(listed());
    expect(baseline.receipts()).toEqual([{ ref: "destination-2", ordinal: 1, count: 1 }, { ref: "destination-1", ordinal: 2, count: 0, page: true }]);
    expect(baseline.paged(listed()).collections?.map((collection) => collection.scope)).toEqual(["p:shelf-list", pageCollection(listed())!.scope]);
    // Paging twice is the same read.
    const paged = baseline.paged(shelf([]));
    expect(baseline.paged(paged)).toBe(paged);
  });

  it("is per resource: the same page in another resource is another page, with a ref of its own", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(shelf([]));
    baseline.receipts();
    baseline.observed(shelf([], { resource: "r:library-tab-2" }));
    expect(baseline.receipts()).toEqual([{ ref: "destination-2", ordinal: 1, count: 0, page: true }]);
    expect(pageCollection(shelf([]))!.group).not.toBe(pageCollection(shelf([], { resource: "r:library-tab-2" }))!.group);
  });

  it("never makes a page original after a seal, nor from a read routed with baseline=false", () => {
    const sealed = new AutomationStudioSiteResetCreateBaselines();
    sealed.seal();
    sealed.observed(shelf([]));
    expect(sealed.receipts()).toEqual([]);
    const routed = new AutomationStudioSiteResetCreateBaselines();
    routed.observed(shelf([]), false);
    expect(routed.receipts()).toEqual([]);
  });

  it("makes a page's scope and group no domain token can equal, and keeps its values as one digest", () => {
    const page = pageCollection(shelf(["s:atlas"], { values: { "p:count": "v:two" } }))!;
    expect(page.scope).not.toMatch(/^[A-Za-z0-9:_-]+$/u);
    expect(page.group).not.toBe(page.scope);
    expect(page.states).toEqual({ "s:atlas": "present" });
    expect(page.values).toMatch(/^v:[0-9a-f]{32}$/u);
    expect(pageCollection(shelf(["s:atlas"], { values: { "p:count": "v:three" } }))!.values).not.toBe(page.values);
    expect(pageCollection(shelf(["s:atlas"]))!.values).toBe(pageCollection(shelf(["s:atlas"], { values: {} }))!.values);
  });
});
