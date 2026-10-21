import { describe, expect, it } from "vitest";
import { AutomationStudioSiteResetCreateBaselines } from "../create-baselines.ts";
import type { AutomationStudioSiteResetDeclared, AutomationStudioSiteResetRead } from "../contracts.ts";

const original = (resource = "r:one"): AutomationStudioSiteResetRead => ({ state: {}, differs: [], scope: "p:destination-page", resource, collections: [
  { scope: "p:destination", group: "g:destination", subjects: ["s:existing"], states: { "s:existing": "v:original" } },
  { scope: "p:sibling", group: "g:destination", subjects: [], states: {} }
] });
const create = (over: Partial<AutomationStudioSiteResetDeclared["control"]> = {}): AutomationStudioSiteResetDeclared => ({ permitted: true, effect: "mutate", consequences: ["create_new"], control: { name: null, kind: null, subject: "s:document", scope: "p:source", resource: "r:one", ...over }, verb: "press" });
const REFUSED = { kind: "refused", evidence: { code: "candidate.create_baseline_required" } };

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

  it("refused, names the lists read complete on this page apart from those read elsewhere, and which list to name", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    baseline.observed(planPage());
    baseline.receipts();
    baseline.observed(recipePage());
    baseline.receipts();
    const verdict = baseline.check(onRecipe, undefined);
    expect(verdict).toMatchObject(REFUSED);
    const instruction = verdict.kind === "refused" ? String(verdict.evidence.instruction) : "";
    expect(instruction).toContain("Lists read complete on this page: destination-2 (1 item), destination-3 (3 items).");
    expect(instruction).toContain("Lists read complete elsewhere: destination-1 (1 item at loc:week)");
    expect(instruction).toContain("only where the new entry would appear in that very list");
    expect(instruction).toContain("A list that only suggests or relates other items to the one acted on never gains the new entry");
    expect(instruction).not.toMatch(/(store|shop|cart|basket|checkout|address|job|save|heart|photo|like|post|friend|order|product|follow|feed|profile|apply|recipe|note|plan)/iu);
  });
});
