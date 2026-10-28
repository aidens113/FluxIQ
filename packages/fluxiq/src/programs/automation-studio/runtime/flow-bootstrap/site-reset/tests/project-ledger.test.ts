import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetProjectSnapshot,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot
} from "../index.ts";

// The build's ledger as a project's briefs drive it: each brief's own ledger,
// ids unique across the build, one writer, and a snapshot for the build record.

function acted(callId: string, consequences: AutomationStudioActionConsequence[], extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored {
  return { callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name: "Save", kind: "button" }, verb: "press" }, ...extra };
}
const back = async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: [] });

describe("project site reset ledger", () => {
  it("hands each brief its own real ledger, the same one on every ask", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const find = project.forBrief("brief.find");
    expect(find).toBeInstanceOf(AutomationStudioSiteResetLedger);
    expect(project.forBrief("brief.find")).toBe(find);
    expect(project.forBrief("brief.add")).not.toBe(find);
    expect(() => project.forBrief("")).toThrow(TypeError);
  });

  it("numbers acts once across the build, attributed to the brief that made them", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const find = project.forBrief("brief.find"), add = project.forBrief("brief.add");
    find.explored(acted("find.1", ["create_new"]));
    add.explored(acted("add.1", ["modify_existing"]));
    find.explored(acted("find.2", ["delete"]));
    // A look, and a call that did not land, take no number.
    add.explored(acted("add.2", ["create_new"], { landed: false }));
    add.trialRan([{ step: 2, definitionId: "demo.press", label: "Add", consequences: ["create_new"] }], "trial.1");
    expect(find.inPlace().map((act) => act.act)).toEqual(["act-1", "act-3"]);
    expect(add.inPlace().map((act) => act.act)).toEqual(["act-2", "act-4"]);
    expect(project.snapshot()).toEqual({
      nextAct: 5,
      acts: [
        { act: "act-1", did: "press \"Save\" button", call: "find.1", owner: "brief.find", ref: "find.1", undoable: true, inPlace: true, left: "yes" },
        { act: "act-2", did: "press \"Save\" button", call: "add.1", owner: "brief.add", ref: "add.1", undoable: true, inPlace: true, left: "yes" },
        { act: "act-3", did: "press \"Save\" button", call: "find.2", owner: "brief.find", ref: "find.2", undoable: true, inPlace: true, left: "yes" },
        { act: "act-4", did: "trial step 2 \"Add\"", owner: "brief.add", ref: "trial.1#step-2", undoable: true, inPlace: true, left: "yes" }
      ]
    });
  });

  it("lets a brief claim and see only its own acts", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const find = project.forBrief("brief.find"), add = project.forBrief("brief.add");
    find.explored(acted("find.1", ["create_new"]));
    add.explored(acted("add.1", ["create_new"]));
    expect(add.claim("act-1")).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act", actsToUndo: [{ act: "act-2" }] } });
    expect(add.claim("act-2")).toEqual({ kind: "undo", undo: { act: "act-2", allowed: [] } });
    expect(find.actOf("add.1")).toBeUndefined();
    expect(add.target("act-1", { effect: "mutate", consequences: ["delete"], control: {} })).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unknown_act" } });
    // An undo of the other brief's act, named by its own ledger, changes nothing there.
    add.explored(acted("add.undo", ["delete"], { undoes: "act-1", on: "own" }));
    expect(find.inPlace()).toEqual([{ act: "act-1", did: "press \"Save\" button", call: "find.1" }]);
    expect(project.snapshot().acts.map((act) => [act.act, act.owner, act.inPlace])).toEqual([["act-1", "brief.find", true], ["act-2", "brief.add", true]]);
  });

  it("checks what is still there against the brief's own acts only, never another brief's line", async () => {
    // Act B removed a line act A had added. In one ledger, B's "removal" of that line is A's to undo; across briefs it is B's own.
    const place = (gone: string, added: string) => ({ state: {}, location: "https://site.test/list", changed: [`gone: ${gone}`, `new: ${added}`], lines: { gone: [gone], added: [added] } });
    const checks = { compare: back, compareAt: async (): Promise<AutomationStudioSiteResetComparison> => ({ moved: true, differs: ["gone: T1"], lines: { gone: ["T1"], added: [] } }) };
    const single = new AutomationStudioSiteResetLedger();
    single.explored(acted("a", ["create_new"]));
    single.placed("act-1", place("T0", "T1"));
    single.explored(acted("b", ["modify_existing"]));
    single.placed("act-2", place("T1", "T2"));
    expect(await single.beforeTrial(checks)).toEqual({ kind: "admit" });

    const project = new AutomationStudioSiteResetProjectLedger();
    const first = project.forBrief("brief.a"), second = project.forBrief("brief.b");
    first.explored(acted("a", ["create_new"]));
    first.placed("act-1", place("T0", "T1"));
    second.explored(acted("b", ["modify_existing"]));
    second.placed("act-2", place("T1", "T2"));
    expect(await first.beforeTrial(checks)).toEqual({ kind: "admit" });
    expect(await second.beforeTrial(checks)).toMatchObject({ kind: "refuse", evidence: { actsToUndo: [{ act: "act-2", stillThere: ["T1"] }] } });
  });

  it("writes the snapshot one write at a time, in the order the acts were recorded, and keeps a failed write for the flush", async () => {
    const written: AutomationStudioSiteResetProjectSnapshot[] = [];
    let open = 0, most = 0, calls = 0;
    const project = new AutomationStudioSiteResetProjectLedger({ persist: async (snapshot) => {
      calls += 1;
      const call = calls;
      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 5 - call));
      open -= 1;
      if (call === 2) throw new Error("record unwritable");
      written.push(snapshot);
    } });
    const find = project.forBrief("brief.find"), add = project.forBrief("brief.add");
    find.explored(acted("find.1", ["create_new"]));
    add.explored(acted("add.1", ["create_new"]));
    find.explored(acted("find.2", ["create_new"]));
    await expect(project.flushed()).rejects.toThrow("record unwritable");
    expect(most).toBe(1);
    expect(written.map((snapshot) => snapshot.acts.map((act) => act.act))).toEqual([["act-1"], ["act-1", "act-2", "act-3"]]);
  });

  it("leaves a ledger made without options numbering its own acts from act-1", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    project.forBrief("brief.find").explored(acted("find.1", ["create_new"]));
    const alone = new AutomationStudioSiteResetLedger();
    alone.explored(acted("call.1", ["create_new"]));
    expect(alone.inPlace()).toEqual([{ act: "act-1", did: "press \"Save\" button", call: "call.1" }]);
  });
});

describe("a project build's possibly lasting acts (t593)", () => {
  it("are recorded by every brief's ledger and marked in the snapshot, never in place to undo", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const find = project.forBrief("brief.find");
    find.explored(acted("find.1", []));
    find.explored(acted("find.2", ["create_new"]));
    expect(project.snapshot().acts.map((act) => ({ act: act.act, possible: act.possible, inPlace: act.inPlace, left: act.left }))).toEqual([
      { act: "act-1", possible: true, inPlace: false, left: "possibly" },
      { act: "act-2", possible: undefined, inPlace: true, left: "yes" }
    ]);
    expect(find.leftover("act-1")).toEqual({ left: "possibly", standing: "possible" });
    expect(find.possiblyInPlace().map((act) => act.act)).toEqual(["act-1"]);
  });
});


it("adopts immutable original inventories without replacing an owner's current observation", () => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const own = project.forBrief("supervisor");
  const collection = { scope: "p:list", group: "g:resource", subjects: [] as string[], states: {} as Record<string, string> };
  project.observed({ state: {}, differs: [], collections: [collection] });
  collection.subjects.push("s:new");
  collection.states["s:new"] = "v:new";
  own.observed({ state: {}, differs: [], collections: [collection] }, false);
  expect(project.forBrief("supervisor")).toBe(own);
  own.trialRan([{ step: 1, definitionId: "demo.add", consequences: ["create_new"], spot: { subject: "s:new" } }]);
  expect(own.target("act-1", { effect: "mutate", consequences: ["delete"], control: { scope: "p:list", subject: "s:new" } })).toMatchObject({ kind: "admit" });
});

it("rejects duplicate original scopes before project Map normalization without replacing valid authority", async () => {
  for (const validFirst of [false, true]) {
    const project = new AutomationStudioSiteResetProjectLedger();
    const origin = { scope: "p:origin", group: "g:resource", subjects: ["s:document"], states: { "s:document": "v:original" } };
    const sibling = { scope: "p:sibling", group: "g:resource", subjects: ["s:other"], states: { "s:other": "v:original" } };
    if (validFirst) project.observed({ state: {}, differs: [], collections: [origin, sibling] });
    project.observed({ state: {}, differs: [], collections: [origin, sibling, structuredClone(sibling)] });
    const whole = project.forBrief("whole");
    whole.trialRan([{ step: 1, definitionId: "demo.press", consequences: ["modify_existing"], spot: { scope: origin.scope, subject: "s:document" } }]);
    whole.observed({ state: {}, differs: [], collections: [origin, sibling] }, false);
    expect((await whole.beforeTrial(back)).kind).toBe(validFirst ? "admit" : "refuse");
  }
});

// t772 w7 (rerun round 6 `run-mvrj7qgf-a44a1427`, contributing cause): the ending told the person a change was left that
// settlement had put back. What the ledger reports as left -- its `leftover`, `standing`, the project snapshot and the acts
// a trial returns as left -- is decided by the one function its settlement answers (`inPlace`, `unsatisfiable`) read:
// settled is never left, closed unsatisfiable is possibly left with its failed condition, open is left. Made-up fixtures: a
// library's reading list and a book's Reserve control, opaque tokens only.
describe("what the ledger reports as left agrees with settlement (t772 w7)", () => {
  const LIBRARY = "r:library";
  type Row = [subject: string, state: string];
  const ROWS: Row[] = [["s:atlas", "v:unread"], ["s:primer", "v:unread"]];
  const reading = (rows: Row[]): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope: "p:reading-page", location: "loc:reading", collections: [{ scope: "p:reading", group: "g:reading", subjects: rows.map(([subject]) => subject), states: Object.fromEntries(rows) }] });
  const book = (scope: string, location: string, place: string, state: string): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIBRARY, scope, location, controls: { [place]: { [state]: 1 } } });
  const ATLAS: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", resource: LIBRARY };
  const pressed = (callId: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
    ({ callId, toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, effect: "mutate", consequences, control: { name: "Reserve", kind: "button", ...spot }, verb: "press" }, ...extra });
  /** Every way the ledger tells where an act stands says the same thing (header). */
  const agrees = (project: AutomationStudioSiteResetProjectLedger) => {
    for (const act of project.snapshot().acts) {
      const brief = project.forBrief(act.owner);
      const left = brief.leftover(act.act)!;
      expect(brief.standing(act.act)).toBe(left.standing);
      expect(act.inPlace).toBe(left.standing === "in_place");
      expect(act.left).toBe(left.left);
      expect(brief.inPlace().some((entry) => entry.act === act.act)).toBe(left.standing === "in_place");
      const apart = brief.unsatisfiable().find((entry) => entry.act === act.act);
      expect(apart?.failed).toBe(left.standing === "unsettleable" ? left.failed : undefined);
      expect(act.failed).toBe(apart?.failed);
    }
  };

  it("never reports an act undone and settled restored as left", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const lend = project.forBrief("brief.lend");
    const RESERVE: AutomationStudioSiteResetSpot = { ...ATLAS, place: "pl:reserve", state: "st:free" };
    lend.observed(book("p:atlas", "loc:atlas", "pl:reserve", "st:free"));
    lend.explored(pressed("reserve", ["modify_existing"], RESERVE));
    lend.observed(book("p:atlas", "loc:atlas", "pl:reserve", "st:held"));
    expect(lend.leftover("act-1")).toEqual({ left: "yes", standing: "in_place" });
    agrees(project);
    const undo = { effect: "mutate" as const, consequences: ["modify_existing" as const], control: { ...RESERVE, state: "st:held" } };
    expect(lend.target("act-1", undo)).toMatchObject({ kind: "admit", on: "own" });
    lend.explored(pressed("cancel", ["modify_existing"], undo.control, { undoes: "act-1", on: "own" }));
    lend.observed(book("p:atlas", "loc:atlas", "pl:reserve", "st:free"));
    expect(lend.leftover("act-1")).toEqual({ left: "no", standing: "restored" });
    expect(project.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", inPlace: false, left: "no" })]);
    agrees(project);
    expect(lend.trialRan([], "trial-1")).toEqual([]);
  });

  it("never reports an act settled unchanged as left: not among the acts a trial returns as left", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const lend = project.forBrief("brief.lend");
    lend.observed(reading(ROWS));
    expect(lend.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    lend.explored(pressed("keep", ["modify_existing"], ATLAS, { resetDestination: "destination-1" }));
    lend.observed(reading(ROWS));
    expect(lend.leftover("act-1")).toEqual({ left: "no", standing: "unchanged" });
    agrees(project);
    expect(lend.trialRan([], "trial-1")).toEqual([]);
  });

  it("never reports a looped pass on another item, at its own place and undone there, as left", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = project.forBrief("builder");
    builder.observed(book("p:atlas", "loc:atlas", "pl:reserve-atlas", "st:free"));
    const witness = builder.admitStep({ effect: "mutate", consequences: ["modify_existing"], control: { name: "Reserve", kind: "button", resource: LIBRARY, subject: "s:atlas", place: "pl:reserve-atlas", state: "st:free" } });
    expect(witness).toEqual({ via: "control", ref: "control-1" });
    const supervisor = project.forBrief("supervisor");
    supervisor.trialRan([{ step: 2, definitionId: "demo.reserve", consequences: ["modify_existing"], witness: witness!, spot: { resource: LIBRARY, place: "pl:reserve-primer", state: "st:free" }, controls: { page: "p:primer", location: "loc:primer", before: { "st:free": 1 }, after: { "st:held": 1 } } }], "trial-1");
    supervisor.observed(book("p:primer", "loc:primer", "pl:reserve-primer", "st:held"));
    expect(supervisor.leftover("act-1")).toEqual({ left: "yes", standing: "in_place" });
    const undo = { effect: "mutate" as const, consequences: ["modify_existing" as const], control: { name: "Reserve", kind: "button", resource: LIBRARY, place: "pl:reserve-primer", state: "st:held" } };
    expect(supervisor.target("act-1", undo)).toMatchObject({ kind: "admit", on: "own" });
    supervisor.explored({ callId: "cancel", toolId: "core.run_node", landed: true, undoes: "act-1", on: "own", operation: "demo.reserve", declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: undo.control, verb: "press" } });
    supervisor.observed(book("p:primer", "loc:primer", "pl:reserve-primer", "st:free"));
    expect(supervisor.leftover("act-1")).toEqual({ left: "no", standing: "restored" });
    expect(project.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", owner: "supervisor", inPlace: false, left: "no" })]);
    expect(project.unsatisfiable()).toEqual([]);
    agrees(project);
    expect(supervisor.trialRan([], "trial-2")).toEqual([]);
  });

  it("reports an act closed as one no call can settle as possibly left, with the condition it failed", () => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const lend = project.forBrief("brief.lend");
    lend.observed(reading(ROWS));
    lend.destinationReceipts();
    lend.explored(pressed("rate", ["modify_existing"], ATLAS, { resetDestination: "destination-1" }));
    lend.observed(reading([["s:atlas", "v:five-stars"], ["s:primer", "v:unread"]]));
    expect(lend.unsatisfiable()).toEqual([expect.objectContaining({ act: "act-1", reason: "gate_unsatisfiable", failed: "no_admissible_undo" })]);
    expect(lend.leftover("act-1")).toEqual({ left: "possibly", standing: "unsettleable", failed: "no_admissible_undo" });
    expect(lend.standing("act-1")).toBe("unsettleable");
    expect(project.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", inPlace: false, left: "possibly", failed: "no_admissible_undo" })]);
    agrees(project);
    // Possibly left: still among the acts a trial returns as left.
    expect(lend.trialRan([], "trial-1").map((act) => act.act)).toEqual(["act-1"]);
  });
});
