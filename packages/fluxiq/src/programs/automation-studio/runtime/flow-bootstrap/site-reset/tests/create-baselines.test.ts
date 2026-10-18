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

  it("preserves observation, unclassified, ordinary modifications and irreversible/mixed policy", () => {
    const baseline = new AutomationStudioSiteResetCreateBaselines();
    const unidentified = create();
    delete unidentified.control.subject;
    delete unidentified.control.page;
    for (const declaration of [
      { ...create(), effect: "observe" as const },
      unidentified,
      { ...create(), consequences: [] },
      { ...create(), consequences: ["modify_existing" as const] },
      { ...create(), consequences: ["send_or_publish" as const] },
      { ...create(), consequences: ["move_money" as const] },
      { ...create(), consequences: ["create_new" as const, "send_or_publish" as const] }
    ]) expect(baseline.check(declaration, undefined)).toEqual({ kind: "admit" });
  });
});
