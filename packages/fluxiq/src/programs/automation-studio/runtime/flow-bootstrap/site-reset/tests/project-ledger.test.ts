import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetComparison,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetProjectSnapshot
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
        { act: "act-1", did: "press \"Save\" button", call: "find.1", owner: "brief.find", ref: "find.1", undoable: true, inPlace: true },
        { act: "act-2", did: "press \"Save\" button", call: "add.1", owner: "brief.add", ref: "add.1", undoable: true, inPlace: true },
        { act: "act-3", did: "press \"Save\" button", call: "find.2", owner: "brief.find", ref: "find.2", undoable: true, inPlace: true },
        { act: "act-4", did: "trial step 2 \"Add\"", owner: "brief.add", ref: "trial.1#step-2", undoable: true, inPlace: true }
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
    expect(project.snapshot().acts.map((act) => ({ act: act.act, possible: act.possible, inPlace: act.inPlace }))).toEqual([
      { act: "act-1", possible: true, inPlace: false },
      { act: "act-2", possible: undefined, inPlace: true }
    ]);
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
