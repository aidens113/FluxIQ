import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetComparison, type AutomationStudioSiteResetExplored, type AutomationStudioSiteResetSpot } from "../index.ts";

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
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_unproved", actsToRestore: [{ act: "act-1" }] } });
  });

  it("requires exact restoration for modern scope-only controls with no usable title", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    ledger.explored(acted("add", ["create_new"], {}, { scope: "p:source" }));
    expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
    expect(await ledger.beforeTrial(back, ["act-1"])).toMatchObject({ kind: "refuse", evidence: { code: "candidate.trial_reset_unproved" } });
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
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-2"]);
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
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
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

  it("requires exact ordered baseline restoration including sibling values, never a fake inverse", async () => {
    for (const defect of ["fake", "order", "quantity", "sibling"] as const) {
      const ledger = move(true);
      inverse(ledger);
      const restored = defect === "fake" ? after() : before();
      if (defect === "order") restored[0]!.subjects.reverse();
      if (defect === "quantity") restored[0]!.states["s:document"] = "v:changed-quantity";
      if (defect === "sibling") restored[2]!.states["s:spare"] = "v:changed-sibling";
      observed(ledger, restored);
      expect(await ledger.beforeTrial(back)).toMatchObject({ kind: "refuse" });
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
