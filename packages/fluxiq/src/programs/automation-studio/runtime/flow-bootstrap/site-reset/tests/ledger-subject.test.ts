import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS, AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetSpot } from "../index.ts";

// An undo tied to its act by what both are about (t719). An act whose effect
// shows on another page or in another list -- an add from a detail page whose
// line appears in the basket, a line moved to a saved list -- has no item an
// undo there can match by token, so every such undo was refused
// `candidate.undo_wrong_target`, the act was kept, and each later trial ran on
// what the earlier ones left. The domain now says what a control is about (its
// row's title, or for a control in no row its nearest titled part) and what
// its page is about (`subject`, `page`, opaque tokens). An undo is admitted on
// a control whose subject is the act's, by a positive match only, and only for
// a class that reverses the act's. An act with no honest reverse is never
// asked for, whatever its subject.

function acted(callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}, spot: AutomationStudioSiteResetSpot = {}): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Add", kind: "button", ...spot }, verb: "press" }, ...extra };
}
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot = {}) => ({ effect: "mutate" as const, consequences, control });
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });
/**
 * Every act still on the site: those to undo, and those no call can settle (t743). These fixtures' reads vouch no list
 * complete, so no ref can ever be issued and an act with no other witness is listed apart, as `gate_unsatisfiable`.
 */
const onSite = (ledger: AutomationStudioSiteResetLedger): string[] => [...ledger.inPlace(), ...ledger.unsatisfiable()].map((act) => act.act).sort();

/** An add on a detail page: the control sits in no item, its own part titled by a seller link, the page by the product. */
const DETAIL_ADD: AutomationStudioSiteResetSpot = { subject: "s:seller", page: "s:kettle" };
/** The basket line that add made, on another page: its own item and its title. */
const KETTLE_LINE: AutomationStudioSiteResetSpot = { item: "i:kettle-line", subject: "s:kettle", page: "s:basket" };
/** A line the basket held before the build began. */
const SOAP_LINE: AutomationStudioSiteResetSpot = { item: "i:soap-line", subject: "s:soap", page: "s:basket" };

describe("observed destination witnesses for cross-page reset", () => {
  const destination = { scope: "p:destination", subject: "s:document" };
  const observe = (ledger: AutomationStudioSiteResetLedger, subjects: string[]) => ledger.observed({ state: {}, location: "destination", differs: [], scope: destination.scope, subjects, collections: [{ scope: destination.scope, group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) }] });
  const add = (ledger: AutomationStudioSiteResetLedger) => ledger.explored(acted("add", ["create_new"], {}, { subject: "s:document", page: "s:document" }));
  const witnessed = () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observe(ledger, ["s:baseline"]);
    add(ledger);
    observe(ledger, ["s:baseline", "s:document"]);
    return ledger;
  };

  it("admits deletion only for a positively witnessed new subject, including a singleton", () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim(["delete"], destination))).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
  });

  it("keeps a cross-page create pending when its source popup disappears without an inverse", async () => {
    const ledger = witnessed();
    ledger.placed("act-1", { state: {}, location: "source", changed: ["created notice"], lines: { gone: [], added: ["created notice"] } });
    const checks = { compare: back, compareAt: async () => ({ moved: false, differs: [], lines: { gone: [], added: [] } }) };
    expect(await ledger.beforeTrial(checks)).toMatchObject({ kind: "refuse" });
    expect(onSite(ledger)).toEqual(["act-1"]);
  });

  it("does not infer no lasting effect from an unchanged modern source page", async () => {
    const ledger = witnessed();
    ledger.noEffect("act-1");
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "admit" });
  });

  it("keeps modern cannotUndo effects listed and allows later positively proved correction", async () => {
    const ledger = witnessed();
    await ledger.beforeTrial(back);
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse" });
    expect(onSite(ledger)).toEqual(["act-1"]);
    expect(ledger.claim("act-1")).toMatchObject({ kind: "undo" });
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "admit" });
    ledger.explored(acted("remove", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    observe(ledger, ["s:baseline"]);
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
  });

  it("requires positive complete baseline proof even for a strict same-page created item", async () => {
    for (const known of [true, false]) {
      const ledger = new AutomationStudioSiteResetLedger();
      if (known) observe(ledger, ["s:baseline"]);
      ledger.explored(acted("create-in-list", ["create_new"], {}, destination));
      ledger.placed("act-1", { state: {}, location: "destination", changed: ["created"], created: ["i:created"] });
      observe(ledger, ["s:baseline", "s:document"]);
      const control = { ...destination, item: "i:created" };
      expect(ledger.target("act-1", aim(["delete"], control))).toMatchObject(known ? { kind: "admit", on: "subject" } : { kind: "refused" });
      if (!known) continue;
      ledger.explored(acted("remove", ["delete"], { undoes: "act-1", on: "subject" }, control));
      observe(ledger, ["s:baseline"]);
      expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    }
  });

  it("invalidates a cached new-subject inverse when a fresh same-group sibling is malformed", () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "admit" });
    ledger.observed({ state: {}, differs: [], collections: [
      { scope: destination.scope, group: "g:page", subjects: ["s:baseline", "s:document"], states: { "s:baseline": "v:s:baseline", "s:document": "v:s:document" } },
      { scope: "p:sibling", group: "g:page", subjects: ["s:other", "s:other"], states: { "s:other": "v:other" } }
    ] });
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "refused" });
  });

  it("refuses deletion of the same product when it already existed before the add", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observe(ledger, ["s:document"]);
    add(ledger);
    observe(ledger, ["s:document"]);
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "refused" });
  });

  it("refuses an ordinary trial on a pre-existing quantity left unresolved, including cannotUndo", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observe(ledger, ["s:document"]);
    add(ledger);
    observe(ledger, ["s:document"]);
    ledger.target("act-1", aim(["delete"], destination));
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", failed: "acts_unsettleable", actsUnsettleable: [{ act: "act-1", failed: "nothing_to_name" }] } });
  });

  it("requires exact restoration for modern scope-only controls with no usable title", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("add", ["create_new"], {}, { scope: "p:source" }));
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", failed: "acts_unsettleable", actsUnsettleable: [{ act: "act-1" }] } });
  });

  it("recovers from a wrong destination by allowing retargeting before anything was pressed", () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim(["delete"], { ...destination, scope: "p:wrong" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved" } });
    expect(ledger.claim("act-1")).toMatchObject({ kind: "undo" });
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "admit" });
  });

  it("cannot bypass ownership by declaring no lasting consequence on an undo's control press", () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim([], destination))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved" } });
    expect(ledger.claim("act-1")).toMatchObject({ kind: "undo" });
  });

  it("one removal restores repeated creations by the same registered control without a second destructive press", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observe(ledger, ["s:baseline"]);
    ledger.trialRan([
      { step: 1, definitionId: "demo.press", control: "Add", consequences: ["create_new"], spot: { subject: "s:document", scope: "p:source" } },
      { step: 2, definitionId: "demo.press", control: "Add", consequences: ["create_new"], spot: { subject: "s:document", scope: "p:source" } }
    ]);
    observe(ledger, ["s:baseline", "s:document"]);
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "admit" });
    ledger.explored(acted("undo", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    observe(ledger, ["s:baseline"]);
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    expect(ledger.inPlace()).toEqual([]);
  });

  it("cannot absorb an unrelated creation merely because it names the same subject", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observe(ledger, ["s:baseline"]);
    ledger.trialRan([
      { step: 1, definitionId: "demo.press", control: "Add", consequences: ["create_new"], spot: { subject: "s:document", scope: "p:source" } },
      { step: 2, definitionId: "demo.other", control: "Add elsewhere", consequences: ["create_new"], spot: { subject: "s:document", scope: "p:source" } }
    ]);
    observe(ledger, ["s:baseline", "s:document"]);
    ledger.target("act-1", aim(["delete"], destination));
    ledger.explored(acted("undo", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    observe(ledger, ["s:baseline"]);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(onSite(ledger)).toEqual(["act-2"]);
  });

  it("ordinary page DOM absence without a complete collection never grants deletion", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.observed({ state: {}, differs: [], scope: destination.scope, subjects: [] });
    add(ledger);
    observe(ledger, ["s:document"]);
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "refused" });
  });

  const twoLists = (ledger: AutomationStudioSiteResetLedger, active: string[], saved: string[], changedSavedState?: string) => ledger.observed({ state: {}, differs: [], collections: [
    { scope: destination.scope, group: "g:page", subjects: active, states: Object.fromEntries(active.map((subject) => [subject, `v:${subject}`])) },
    { scope: "p:saved", group: "g:page", subjects: saved, states: Object.fromEntries(saved.map((subject) => [subject, changedSavedState ?? `v:${subject}`])) }
  ] });

  it("does not count a purported Delete as restored when it moved the new subject into a sibling list", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    twoLists(ledger, ["s:baseline"], ["s:stored"]);
    add(ledger);
    twoLists(ledger, ["s:baseline", "s:document"], ["s:stored"]);
    ledger.target("act-1", aim(["delete"], destination));
    ledger.explored(acted("fake-delete", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    twoLists(ledger, ["s:baseline"], ["s:stored", "s:document"]);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
  });

  it("preserves a same-subject sibling row that already existed, including its quantity state", async () => {
    for (const changed of [false, true]) {
      const ledger = new AutomationStudioSiteResetLedger();
      twoLists(ledger, ["s:baseline"], ["s:document"]);
      add(ledger);
      twoLists(ledger, ["s:baseline", "s:document"], ["s:document"]);
      ledger.target("act-1", aim(["delete"], destination));
      ledger.explored(acted("delete", ["delete"], { undoes: "act-1", on: "subject" }, destination));
      twoLists(ledger, ["s:baseline"], ["s:document"], changed ? "v:quantity-changed" : undefined);
      expect((await ledger.beforeTrial(back)).kind).toBe(changed ? "refuse" : "admit");
    }
  });

  it("requires the original collection's baseline rows and values, not merely disappearance of the new subject", async () => {
    const ledger = witnessed();
    ledger.target("act-1", aim(["delete"], destination));
    ledger.explored(acted("delete-too-much", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    observe(ledger, []);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
  });

  it("does not establish a baseline by first reading a destination after the act", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    add(ledger);
    observe(ledger, ["s:document"]);
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "refused" });
  });

  it("never treats a same-heading page as the observed destination", () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim(["delete"], { ...destination, scope: "p:other" }))).toMatchObject({ kind: "refused" });
  });

  it("refuses unproved quantitative modifications even with a new-subject witness", () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
  });

  it("requires the admitted subject to actually disappear before the next trial", async () => {
    const ledger = witnessed();
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "admit" });
    ledger.explored(acted("undo", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    ledger.undoSeen("act-1", true);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    observe(ledger, ["s:baseline"]);
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    expect(ledger.inPlace()).toEqual([]);
  });

  it("spends a witnessed deletion once, preventing repeated undo presses", () => {
    const ledger = witnessed();
    ledger.target("act-1", aim(["delete"], destination));
    ledger.explored(acted("undo", ["delete"], { undoes: "act-1", on: "subject" }, destination));
    expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_done" } });
  });

  it("does not overwrite the pre-effect baseline with later observations", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observe(ledger, ["s:document"]);
    observe(ledger, []);
    add(ledger);
    observe(ledger, ["s:document"]);
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "refused" });
  });
});

describe("an act with no honest reverse (t719)", () => {
  it("a message sent or an order placed is recorded as not undoable: never asked for, never claimable, whatever its subject", async () => {
    for (const consequence of ["send_or_publish", "move_money"] as const) {
      const ledger = new AutomationStudioSiteResetLedger();
      ledger.explored(acted("call.send", [consequence], {}, { subject: "s:thread", page: "s:thread" }));
      expect(ledger.inPlace()).toEqual([]);
      expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
      expect(ledger.target("act-1", aim(["delete"], { subject: "s:thread" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
      expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
    }
    const trial = new AutomationStudioSiteResetLedger();
    expect(trial.trialRan([{ step: 4, definitionId: "demo.click", label: "place the order", consequences: ["move_money"], spot: { subject: "s:order", page: "s:checkout" } }], "trial.1")).toEqual([]);
  });

  it("an act that also sent something stays not undoable, though its other class could be reversed", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("call.post", ["create_new", "send_or_publish"], {}, { subject: "s:thread" }));
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.target("act-1", aim(["delete"], { subject: "s:thread" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
  });
});

// Preservation regressions discovered in review. A product identity alone does
// not prove that the whole product line was created by this build.
describe("reset preserves effects which predate the build", () => {
  it("refuses removing an existing subject after an add whose destination creation was never witnessed", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    // Before this build the destination already held two units. An add on a
    // different page increments that line; its subject is unchanged.
    ledger.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["create_new"], spot: { subject: "s:document", page: "s:document" } }]);
    expect(ledger.target("act-1", aim(["delete"], { item: "i:existing-document", subject: "s:document" }))).toMatchObject({ kind: "refused" });
  });

  it("does not treat one changed undo as proof that the exact original effect disappeared", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["modify_existing"], spot: { subject: "s:document" } }]);
    // The act changed a value by two. A single undo changed it by one; the
    // only evidence the current seam provides is that something changed.
    ledger.explored(acted("undo.partial", ["modify_existing"], { undoes: "act-1", on: "subject" }, { subject: "s:document" }));
    ledger.undoSeen("act-1", true);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(onSite(ledger)).toEqual(["act-1"]);
  });
});


describe("positive collection-transfer inverses", () => {
  const origin = { scope: "p:active", subject: "s:document", item: "i:document" };
  const destination = { scope: "p:archive", subject: "s:document", item: "i:stored-document" };
  const collection = (scope: string, subjects: string[], changed: Record<string, string> = {}) => ({ scope, group: "g:page", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, changed[subject] ?? `v:${subject}`])) });
  const before = () => [collection(origin.scope, ["s:document", "s:baseline"]), collection(destination.scope, ["s:archived"]), collection("p:sibling", ["s:spare"])];
  const after = () => [collection(origin.scope, ["s:baseline"]), collection(destination.scope, ["s:document", "s:archived"], { "s:document": "v:stored:2" }), collection("p:sibling", ["s:spare"])];
  const observed = (ledger: AutomationStudioSiteResetLedger, collections = before()) => ledger.observed({ state: {}, location: "collections", differs: [], collections });
  const move = (trial = false, witness = true) => {
    const ledger = new AutomationStudioSiteResetLedger();
    observed(ledger);
    if (trial) ledger.trialRan([{ step: 1, definitionId: "demo.move", consequences: ["modify_existing"], spot: origin, ...(witness ? { collections: { before: before(), after: after() } } : {}) }]);
    else {
      ledger.explored(acted("move", ["modify_existing"], {}, origin));
      if (witness) ledger.placed("act-1", { state: {}, location: "collections", changed: ["moved"], collections: { before: before(), after: after() } });
    }
    observed(ledger, after());
    return ledger;
  };
  const inverse = (ledger: AutomationStudioSiteResetLedger) => {
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toEqual({ kind: "admit", on: "subject", allowed: ["modify_existing"] });
    ledger.explored(acted("inverse", ["modify_existing"], { undoes: "act-1", on: "subject" }, destination));
  };

  it("restores explored and trial transfers only from immediate equivalent witnesses and spends one inverse", async () => {
    for (const trial of [false, true]) {
      const ledger = move(trial);
      inverse(ledger);
      expect(ledger.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_done" } });
      observed(ledger);
      expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
      expect(ledger.inPlace()).toEqual([]);
    }
  });

  it("refuses deletion and later quantitative edits of the moved subject", () => {
    const ledger = move();
    expect(ledger.target("act-1", aim(["delete"], destination))).toMatchObject({ kind: "refused" });
    const edited = after();
    edited[1]!.states["s:document"] = "v:stored:3";
    observed(ledger, edited);
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
  });

  it("never invents an immediate effect witness from a later complete observation", () => {
    for (const trial of [false, true]) expect(move(trial, false).target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
  });

  it("rejects incomplete, cross-resource, pre-existing destination and wrong-origin transition witnesses", () => {
    for (const kind of ["partial", "resource", "existing", "origin"] as const) {
      const ledger = new AutomationStudioSiteResetLedger();
      const was = before(), now = after();
      if (kind === "partial") was.splice(1, 1);
      if (kind === "resource") now[1]!.group = "g:other";
      if (kind === "existing") was[1] = collection(destination.scope, ["s:document", "s:archived"]);
      if (kind === "origin") {
        was[0]!.scope = "p:unrelated";
        now[0]!.scope = "p:unrelated";
      }
      observed(ledger, was);
      ledger.trialRan([{ step: 1, definitionId: "demo.move", consequences: ["modify_existing"], spot: origin, collections: { before: was, after: now } }]);
      observed(ledger, now);
      expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
    }
  });

  // L1: the lists the act moved between must be restored exactly; a list on the same page that holds nothing it touched
  // (`p:sibling`) no longer blocks, where F1 required the whole group.
  it("requires exact ordered restoration of the lists it moved between, never a fake inverse; an unrelated list does not block", async () => {
    for (const defect of ["fake", "order", "quantity", "sibling"] as const) {
      const ledger = move(true);
      inverse(ledger);
      const restored = defect === "fake" ? after() : before();
      if (defect === "order") restored[0]!.subjects.reverse();
      if (defect === "quantity") restored[0]!.states["s:document"] = "v:changed-quantity";
      if (defect === "sibling") restored[2]!.states["s:spare"] = "v:changed-sibling";
      observed(ledger, restored);
      expect((await ledger.beforeTrial(back)).kind).toBe(defect === "sibling" ? "admit" : "refuse");
    }
  });

  it("can reverse a retry's pure transfer despite transient error text before the move", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observed(ledger);
    const retry = before();
    retry[0]!.states["s:document"] = "v:two-with-transient-retry-error";
    observed(ledger, retry);
    ledger.explored(acted("retry-move", ["modify_existing"], {}, origin));
    ledger.placed("act-1", { state: {}, location: "collections", changed: ["moved"], collections: { before: retry, after: after() } });
    observed(ledger, after());
    inverse(ledger);
    observed(ledger);
    expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
  });

  // L1: fresh exact evidence of every list either act could change; an unrelated list changed or missing (`sibling`,
  // `partial`) no longer blocks, a missing list the acts touched (`own-missing`) still does.
  it("a declared retry inverse also restores its failed original intent only with fresh exact evidence of the lists it could change", async () => {
    for (const defect of ["none", "quantity", "order", "sibling", "partial", "own-missing", "resource"] as const) {
      const ledger = new AutomationStudioSiteResetLedger();
      observed(ledger);
      ledger.explored(acted("first-attempt", ["modify_existing"], {}, origin));
      // Baseline evidence from before a press is never its restoration.
      expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
      const retry = before();
      retry[0]!.states["s:document"] = "v:transient-retry-error";
      observed(ledger, retry);
      ledger.explored(acted("retry", ["modify_existing"], {}, origin));
      ledger.placed("act-2", { state: {}, location: "collections", changed: ["moved"], collections: { before: retry, after: after() } });
      observed(ledger, after());
      expect(ledger.target("act-2", aim(["modify_existing"], destination))).toMatchObject({ kind: "admit" });
      ledger.explored(acted("inverse", ["modify_existing"], { undoes: "act-2", on: "subject" }, destination));
      const restored = before();
      if (defect === "quantity") restored[0]!.states["s:document"] = "v:changed";
      if (defect === "order") restored[0]!.subjects.reverse();
      if (defect === "sibling") restored[2]!.states["s:spare"] = "v:changed";
      if (defect === "partial") restored.splice(2, 1);
      if (defect === "own-missing") restored.splice(0, 1);
      if (defect === "resource") for (const entry of restored) {
        entry.group = "g:other";
        entry.scope = `other:${entry.scope}`;
      }
      observed(ledger, restored);
      const settles = defect === "none" || defect === "sibling" || defect === "partial";
      expect((await ledger.beforeTrial(back)).kind).toBe(settles ? "admit" : "refuse");
      if (!settles) expect(ledger.inPlace().map((act) => act.act)).toContain("act-1");
    }
  });

  it("refuses the earlier claim but names a unique later witnessed effect without consuming either act", async () => {
    for (const resource of ["r:one", undefined]) {
      const ledger = new AutomationStudioSiteResetLedger();
      const source = { ...origin, ...(resource ? { resource } : {}) };
      const target = { ...destination, ...(resource ? { resource } : {}) };
      observed(ledger);
      ledger.explored(acted("first-attempt", ["modify_existing"], {}, source));
      ledger.explored(acted("successful-retry", ["modify_existing"], {}, source));
      ledger.placed("act-2", { state: {}, location: "collections", changed: ["moved"], collections: { before: before(), after: after() } });
      observed(ledger, after());
      const pending = ledger.inPlace();
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(ledger.target("act-1", aim(["modify_existing"], target))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved", otherActsWithObservedEffect: [{ act: "act-2", call: "successful-retry" }] } });
        expect(ledger.inPlace()).toEqual(pending);
        expect(ledger.claim("act-2")).toMatchObject({ kind: "undo" });
      }
      expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
      expect(ledger.target("act-2", aim(["modify_existing"], target))).toMatchObject({ kind: "admit" });
      ledger.explored(acted("explicit-inverse", ["modify_existing"], { undoes: "act-2", on: "subject" }, target));
      expect(ledger.claim("act-2")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_already_done" } });
      observed(ledger);
      expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
      expect(ledger.inPlace()).toEqual([]);
    }
  });

  it.each(["subject", "scope", "claimed-resource", "retry-resource", "target-resource", "missing-claimed-resource", "missing-retry-resource", "missing-target-resource", "empty-resource", "group", "no-baseline", "partial-baseline", "late-baseline", "missing-witness", "partial-current", "malformed-current", "changed-state", "stale-current", "earlier-only", "ambiguous", "spent", "undone", "mixed", "irreversible", "undeclared", "mixed-claim", "irreversible-claim", "undeclared-claim"])("does not suggest another act with %s evidence", async defect => {
    const ledger = new AutomationStudioSiteResetLedger({ possible: true });
    const first: AutomationStudioSiteResetSpot = { ...origin, resource: "r:one" };
    const retry: AutomationStudioSiteResetSpot = { ...origin, resource: "r:one" };
    const target: AutomationStudioSiteResetSpot = { ...destination, resource: "r:one" };
    if (defect === "subject") first.subject = "s:baseline";
    if (defect === "scope") first.scope = "p:sibling";
    if (defect === "claimed-resource") first.resource = "r:other";
    if (defect === "retry-resource") retry.resource = "r:other";
    if (defect === "target-resource") target.resource = "r:other";
    if (defect === "missing-claimed-resource") delete first.resource;
    if (defect === "missing-retry-resource") delete retry.resource;
    if (defect === "missing-target-resource") delete target.resource;
    if (defect === "empty-resource") first.resource = "";
    const firstClasses: AutomationStudioActionConsequence[] = defect === "mixed-claim" ? ["modify_existing", "create_new"] : defect === "irreversible-claim" ? ["modify_existing", "send_or_publish"] : defect === "undeclared-claim" ? [] : ["modify_existing"];
    const retryClasses: AutomationStudioActionConsequence[] = defect === "mixed" ? ["modify_existing", "create_new"] : defect === "irreversible" ? ["modify_existing", "send_or_publish"] : defect === "undeclared" ? [] : ["modify_existing"];
    if (defect !== "no-baseline" && defect !== "late-baseline") observed(ledger, defect === "partial-baseline" ? before().slice(0, 1) : before());
    if (defect === "stale-current") observed(ledger, after());
    let claimed = "act-1", candidate = "act-2";
    if (defect === "earlier-only") {
      ledger.explored(acted("successful-retry", retryClasses, {}, retry));
      ledger.placed("act-1", { state: {}, location: "collections", changed: ["moved"], collections: { before: before(), after: after() } });
      ledger.explored(acted("later-intent", firstClasses, {}, first));
      claimed = "act-2";
      candidate = "act-1";
    } else {
      ledger.explored(acted("first-intent", firstClasses, {}, first));
      if (defect === "late-baseline") observed(ledger);
      ledger.explored(acted("successful-retry", retryClasses, {}, retry));
      if (defect !== "missing-witness") ledger.placed("act-2", { state: {}, location: "collections", changed: ["moved"], collections: { before: before(), after: after() } });
    }
    const current = after();
    if (defect === "group") current[1]!.group = "g:foreign";
    if (defect === "partial-current") current.splice(2, 1);
    if (defect === "malformed-current") delete current[2]!.states["s:spare"];
    if (defect === "changed-state") current[1]!.states["s:document"] = "v:changed";
    if (defect !== "stale-current") observed(ledger, current);
    if (defect === "ambiguous") {
      ledger.explored(acted("separate-return", ["modify_existing"], {}, target));
      observed(ledger);
      ledger.explored(acted("another-forward", ["modify_existing"], {}, retry));
      ledger.placed("act-4", { state: {}, location: "collections", changed: ["moved"], collections: { before: before(), after: after() } });
      observed(ledger, after());
    }
    if (defect === "spent" || defect === "undone") {
      expect(ledger.target(candidate, aim(["modify_existing"], target))).toMatchObject({ kind: "admit" });
      ledger.explored(acted("explicit-inverse", ["modify_existing"], { undoes: candidate, on: "subject" }, target));
      if (defect === "undone") {
        observed(ledger);
        expect(await ledger.beforeTrial(back)).toEqual({ kind: "admit" });
      }
    }
    const pending = ledger.inPlace();
    const result = ledger.target(claimed, aim(["modify_existing"], target));
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") expect(result.evidence).not.toHaveProperty("otherActsWithObservedEffect");
    expect(ledger.inPlace()).toEqual(pending);
  });

  it("does not promote an undeclared retry into a declared transfer witness", () => {
    const ledger = new AutomationStudioSiteResetLedger({ possible: true });
    observed(ledger);
    ledger.explored(acted("first-attempt", ["modify_existing"], {}, origin));
    ledger.explored(acted("undeclared-retry", [], {}, origin));
    ledger.placed("act-2", { state: {}, location: "collections", changed: ["moved"], collections: { before: before(), after: after() } });
    observed(ledger, after());
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
    expect(ledger.target("act-2", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
  });

  // L1: `partial` drops the press's own list and refuses; a list it never touched missing (`unrelated-partial`) does not.
  it("settles a truly failed declared press from fresh complete original evidence without a needless inverse", async () => {
    for (const defect of ["none", "stale", "no-baseline", "partial", "unrelated-partial", "resource"] as const) {
      const ledger = new AutomationStudioSiteResetLedger();
      if (defect !== "no-baseline") observed(ledger);
      ledger.explored(acted("failed-press", ["modify_existing"], {}, origin));
      const restored = before();
      if (defect === "partial") restored.splice(0, 1);
      if (defect === "unrelated-partial") restored.splice(1, 1);
      if (defect === "resource") for (const entry of restored) {
        entry.group = "g:other";
        entry.scope = `other:${entry.scope}`;
      }
      if (defect !== "stale") observed(ledger, restored);
      expect((await ledger.beforeTrial(back)).kind).toBe(defect === "none" || defect === "unrelated-partial" ? "admit" : "refuse");
    }
  });

  it.each(["baseline-missing", "current-missing", "both-missing", "blank", "extra"])("refuses original-state settlement with %s fingerprints", async (defect) => {
    const ledger = new AutomationStudioSiteResetLedger();
    const was = before(), now = before();
    if (defect === "baseline-missing" || defect === "both-missing") delete was[0]!.states["s:document"];
    if (defect === "current-missing" || defect === "both-missing") delete now[0]!.states["s:document"];
    if (defect === "blank") {
      was[0]!.states["s:document"] = "";
      now[0]!.states["s:document"] = "";
    }
    if (defect === "extra") {
      was[0]!.states["s:unknown"] = "v:unknown";
      now[0]!.states["s:unknown"] = "v:unknown";
    }
    observed(ledger, was);
    ledger.explored(acted("failed-press", ["modify_existing"], {}, origin));
    observed(ledger, now);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
  });

  it.each(["original-subject", "current-subject", "original-sibling", "current-sibling", "original-scope", "current-scope"])("never normalizes duplicate %s evidence into whole-group restoration", async (defect) => {
    const ledger = new AutomationStudioSiteResetLedger();
    const was = before(), now = before();
    const bad = defect.startsWith("original") ? was : now;
    if (defect.endsWith("subject")) bad[0]!.subjects.push("s:document");
    if (defect.endsWith("sibling")) bad[2]!.subjects.push("s:spare");
    if (defect.endsWith("scope")) bad.push(structuredClone(bad[2]!));
    ledger.adoptOriginalCollections(was);
    ledger.explored(acted("failed-press", ["modify_existing"], {}, origin));
    observed(ledger, now);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
  });

  it("invalidates a cached transfer inverse for a malformed fresh sibling and recovers on valid evidence", () => {
    const ledger = move();
    const invalid = after();
    invalid[2]!.subjects.push("s:spare");
    observed(ledger, invalid);
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused" });
    observed(ledger, after());
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "admit" });
  });

  it("moving back an earlier quantity edit never absorbs that edit or proves whole reset", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    observed(ledger);
    ledger.explored(acted("quantity", ["modify_existing"], {}, origin));
    const edited = before(), moved = after();
    edited[0]!.states["s:document"] = "v:quantity-three";
    moved[1]!.states["s:document"] = "v:stored:3";
    observed(ledger, edited);
    ledger.explored(acted("move", ["modify_existing"], {}, origin));
    ledger.placed("act-2", { state: {}, location: "collections", changed: ["moved"], collections: { before: edited, after: moved } });
    observed(ledger, moved);
    expect(ledger.target("act-1", aim(["modify_existing"], destination))).toMatchObject({ kind: "refused", evidence: { otherActsWithObservedEffect: [{ act: "act-2" }] } });
    expect(ledger.target("act-2", aim(["modify_existing"], destination))).toMatchObject({ kind: "admit" });
    ledger.explored(acted("inverse", ["modify_existing"], { undoes: "act-2", on: "subject" }, destination));
    observed(ledger, edited);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(ledger.inPlace().map((act) => act.act)).toContain("act-1");
  });

  it("rejects swapped baseline rows after a new-line removal too", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const scope = "p:list";
    observed(ledger, [collection(scope, ["s:a", "s:b"])]);
    ledger.explored(acted("create", ["create_new"], {}, { subject: "s:document" }));
    observed(ledger, [collection(scope, ["s:a", "s:b", "s:document"])]);
    expect(ledger.target("act-1", aim(["delete"], { scope, subject: "s:document" }))).toMatchObject({ kind: "admit" });
    ledger.explored(acted("remove", ["delete"], { undoes: "act-1", on: "subject" }, { scope, subject: "s:document" }));
    observed(ledger, [collection(scope, ["s:b", "s:a"])]);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
  });
});

// F1, job save r1 (`run-mvectfld-c2f5d958`, cause 2): two presses from a side
// pane and a detail page -- no list of their own -- that the site itself
// failed. The list they land in was read complete before and after them and was
// unchanged, but nothing could settle them, so the build had no way forward.
// A control in no list counts only against a destination named for it with an
// issued `resetDestination` ref -- on its own call, or later on a look that
// names it under `undoes` -- never against every list ever read: its real
// effect may land somewhere never read. With that destination read complete
// after the act, exactly as first observed and still without the act's
// subject, the act needs no proven undo; unnamed, it refuses as before.
describe("a press with no list of its own whose named destination stays exactly as first observed (F1)", () => {
  const SITE = "r:site";
  const PANE: AutomationStudioSiteResetSpot = { subject: "s:document", page: "s:results", resource: SITE };
  const list = (scope: string, subjects: string[]) => ({ scope, group: "g:mine", subjects, states: Object.fromEntries(subjects.map((subject) => [subject, `v:${subject}`])) });
  const mine = () => [list("p:mine", ["s:held-a", "s:held-b"]), list("p:mine-archived", ["s:held-c"])];
  const read = (ledger: AutomationStudioSiteResetLedger, collections: Array<ReturnType<typeof list>>) => ledger.observed({ state: {}, differs: [], resource: SITE, scope: "p:mine-page", collections });
  /** Two failed presses; the destination named on each press, on a later look under `undoes`, or not at all. */
  const pressed = (named: "on-act" | "on-look" | "none" | "invented", spot: AutomationStudioSiteResetSpot = PANE, before = mine()) => {
    const ledger = new AutomationStudioSiteResetLedger();
    read(ledger, before);
    const ref = named === "invented" ? "destination-9" : ledger.destinationReceipts()[0]!.ref;
    const onAct = named === "on-act" || named === "invented" ? { resetDestination: ref } : {};
    ledger.explored(acted("save.first", ["modify_existing"], onAct, spot));
    ledger.explored(acted("save.second", ["modify_existing"], onAct, spot));
    if (named === "on-look") for (const act of ["act-1", "act-2"]) {
      expect(ledger.claim(act)).toMatchObject({ kind: "undo" });
      ledger.explored({ callId: `look.${act}`, toolId: "core.run_node", landed: true, undoes: act, on: "moving", resetDestination: ref, declared: { permitted: true, effect: "observe", consequences: [], control: { name: null, kind: "page" }, verb: "read" } });
    }
    return ledger;
  };

  it.each(["on-act", "on-look"] as const)("runs the trial with both failed presses listed as left with no change seen, the destination named %s", async (named) => {
    const ledger = pressed(named);
    read(ledger, mine());
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "save.first" }, { act: "act-2", call: "save.second" }] } });
    expect(ledger.inPlace()).toEqual([]);
  });

  it("refuses an unnamed destination however unchanged every list read is, and says how to name one", async () => {
    const ledger = pressed("none");
    read(ledger, mine());
    const refused = await ledger.beforeTrial(back);
    expect(refused).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(String(refused.kind === "refuse" ? refused.evidence.instruction : "")).toContain("resetDestination");
    const unproved = await ledger.beforeTrial(back, ["act-1", "act-2"]);
    expect(unproved).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_unproved" } });
    expect(String(unproved.kind === "refuse" ? unproved.evidence.instruction : "")).toContain("resetDestination");
  });

  // L1: `partial` drops the named list itself; `held-subject-changed` changes the row value of the subject the named list
  // already held before the presses.
  it.each(["invented-ref", "no-read-after", "subject-now-present", "partial", "malformed", "held-subject-changed"] as const)("still refuses a named destination with %s", async (defect) => {
    const held = () => [list("p:mine", ["s:document", "s:held-b"]), list("p:mine-archived", ["s:held-c"])];
    const before = defect === "held-subject-changed" ? held() : mine();
    const ledger = pressed(defect === "invented-ref" ? "invented" : "on-act", PANE, before);
    const after = defect === "held-subject-changed" ? held() : mine();
    if (defect === "held-subject-changed") after[0]!.states["s:document"] = "v:changed";
    if (defect === "subject-now-present") after[0] = list("p:mine", ["s:held-a", "s:held-b", "s:document"]);
    if (defect === "partial") after.splice(0, 1);
    if (defect === "malformed") after[1] = list("p:mine-archived", ["s:held-c", "s:held-c"]);
    if (defect !== "no-read-after") read(ledger, after);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(await ledger.beforeTrial(back, ["act-1", "act-2"])).toMatchObject({ kind: "refuse" });
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1", "act-2"]);
  });

  // L1, by design: the named list alone is the witness of a press whose own list was never read before it
  // (`own-list-unread`, F1 refused it); a subject the named list already held settles by its unchanged row value
  // (`subject-held-before`, F1 refused it); and a list never named for it missing from the read (`unrelated-partial`) does
  // not block.
  it.each(["own-list-unread", "subject-held-before", "unrelated-partial"] as const)("settles on its named destination alone with %s", async (defect) => {
    const before = defect === "subject-held-before" ? [list("p:mine", ["s:document", "s:held-b"]), list("p:mine-archived", ["s:held-c"])] : mine();
    const ledger = pressed("on-act", defect === "own-list-unread" ? { ...PANE, scope: "p:pane" } : PANE, before);
    const after = structuredClone(before);
    if (defect === "unrelated-partial") after.splice(1, 1);
    read(ledger, after);
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(ledger.inPlace()).toEqual([]);
  });

  it("answers a claim on a left act in words that owe no undo", async () => {
    const ledger = pressed("on-act");
    read(ledger, mine());
    const claimed = ledger.claim("act-1");
    expect(claimed).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_act_kept", instruction: WORDS.keptAct(true) } });
    expect(WORDS.keptAct(true)).not.toContain("requires proved baseline restoration");
  });
});
