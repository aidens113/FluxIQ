import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS,
  AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetSpot,
  type AutomationStudioSiteResetUnsettleableAct
} from "../index.ts";

// An act whose differing list no undo could ever put back (t748, t743 open
// item 2; job `run-mvgw1854-5d10955b`, where every honest variation of one
// undo was refused until the repeat guard ended the brief). t743 made an act
// `gate_unsatisfiable` only for a list Core cannot read again or nothing left
// to name; an act whose list still differs in a way no admission path of
// `../undo-admission.ts` can reverse stayed listed to undo. It is now listed
// apart with `no_admissible_undo`, out of the acts to undo, with trials refused
// and the honest exit offered; an act an undo can still put back is unchanged.
// Made-up fixtures: a library's reading list and a book's star, opaque tokens.

const SITE = "r:library";
type Row = [subject: string, state: string];
const readList = (ledger: AutomationStudioSiteResetLedger, rows: Row[]) =>
  ledger.observed({ state: {}, differs: [], resource: SITE, scope: "p:reading-page", location: "loc:reading", collections: [{ scope: "p:reading", group: "g:reading", subjects: rows.map(([subject]) => subject), states: Object.fromEntries(rows) }] });
const ORIGINAL: Row[] = [["s:atlas", "v:unread"], ["s:primer", "v:unread"]];
/** A book's own page: it sits in no row, and the domain names it as the list does. */
const BOOK: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", resource: SITE };
/** A book the list did not hold before the build. */
const NEW_BOOK: AutomationStudioSiteResetSpot = { subject: "s:codex", page: "s:codex", resource: SITE };
const row = (subject: string): AutomationStudioSiteResetSpot => ({ scope: "p:reading", subject, item: `i:${subject}`, resource: SITE });
const acted = (callId: string, name: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences, control: { name, kind: "button", ...spot }, verb: "press" }, ...extra });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control });
const compare = async () => ({ moved: false, differs: [] });
const apart = (call: string, did: string): AutomationStudioSiteResetUnsettleableAct[] => [{ act: "act-1", call, did, reason: "gate_unsatisfiable", failed: "no_admissible_undo" }];
/** What a trial starts with when only acts no call can settle remain (t775): they are listed on the site, and the trial runs. */
const honestExit = (acts: AutomationStudioSiteResetUnsettleableAct[]) => ({ kind: "admit", startedWith: { acts, instruction: WORDS.startedWith(false) } });
/** A ledger that read the reading list complete, was shown its ref, and pressed `name` once. */
const after = (call: string, name: string, consequences: AutomationStudioActionConsequence[], spot: AutomationStudioSiteResetSpot, now: Row[], named = true): AutomationStudioSiteResetLedger => {
  const ledger = new AutomationStudioSiteResetLedger();
  readList(ledger, ORIGINAL);
  expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
  ledger.explored(acted(call, name, consequences, spot, named ? { resetDestination: "destination-1" } : {}));
  readList(ledger, now);
  return ledger;
};

describe("an act whose differing list no undo can put back is gate_unsatisfiable (no_admissible_undo)", () => {
  it("a change to a row the list held before the build: listed apart, out of actsToUndo, trials refused with the honest exit", async () => {
    const ledger = after("rate", "Rate", ["modify_existing"], BOOK, [["s:atlas", "v:five-stars"], ["s:primer", "v:unread"]]);
    const acts = apart("rate", "press \"Rate\" button");
    expect(ledger.unsatisfiable()).toEqual(acts);
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.standing("act-1")).toBe("unsettleable");
    for (let ask = 0; ask < 2; ask += 1) expect(await ledger.beforeTrial(compare)).toEqual(honestExit(acts));
    // cannotUndo never settles it, and an undo of the row is refused unrun, its refusal listing the act apart, not to undo.
    expect(await ledger.beforeTrial(compare, ["act-1"])).toEqual(honestExit(acts));
    expect(ledger.target("act-1", aim(["modify_existing"], row("s:atlas")))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved", failed: "subject_there_before", canMeet: "no_call", actsToUndo: [], actsUnsettleable: acts } });
    expect(WORDS.condition("no_admissible_undo", "no_call")).toMatch(/^No call this build may make can put back/u);
  });

  it("a removal of a row the list held before the build: its own row is gone, so nothing could put it back", async () => {
    const ledger = after("drop", "Remove", ["delete"], row("s:primer"), [["s:atlas", "v:unread"]], false);
    const acts = apart("drop", "press \"Remove\" button");
    expect(ledger.unsatisfiable()).toEqual(acts);
    expect(ledger.inPlace()).toEqual([]);
    expect(await ledger.beforeTrial(compare)).toEqual(honestExit(acts));
  });

  it("two rows new on the list and one act whose undo removes without asking once: no undo could remove both", () => {
    const ledger = after("keep", "Keep", ["create_new"], NEW_BOOK, [...ORIGINAL, ["s:codex", "v:unread"], ["s:stray", "v:unread"]]);
    expect(ledger.unsatisfiable()).toEqual(apart("keep", "press \"Keep\" button"));
    expect(ledger.inPlace()).toEqual([]);
  });

  it("an own control that answered a third state: the refusal that says so lists the act apart at once", async () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const card = (state: string) => ledger.observed({ state: {}, differs: [], resource: SITE, scope: "p:book", location: "loc:book", controls: { "pl:star": { [state]: 1 } } });
    const STATELESS: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", resource: SITE, place: "pl:star" };
    const STAR: AutomationStudioSiteResetSpot = { ...STATELESS, state: "st:off" };
    card("st:off");
    ledger.explored(acted("star", "Star", ["modify_existing"], STAR));
    card("st:on");
    expect(ledger.inPlace().map((entry) => entry.act)).toEqual(["act-1"]);
    card("st:half");
    // A press back that names no state of its own says nothing of the control: refused as before, still listed.
    expect(ledger.target("act-1", aim(["modify_existing"], STATELESS))).toMatchObject({ kind: "refused", evidence: { failed: "control_state_differs", actsToUndo: [{ act: "act-1" }] } });
    expect(ledger.unsatisfiable()).toEqual([]);
    const acts = apart("star", "press \"Star\" button");
    expect(ledger.target("act-1", aim(["modify_existing"], { ...STAR, state: "st:half" }))).toMatchObject({ kind: "refused", evidence: { code: "candidate.undo_unproved", failed: "control_state_differs", canMeet: "no_call", actsToUndo: [], actsUnsettleable: acts } });
    expect(ledger.unsatisfiable()).toEqual(acts);
    expect(ledger.inPlace()).toEqual([]);
    expect(await ledger.beforeTrial(compare)).toEqual(honestExit(acts));
    // The control showing the act's state again: its press back is admitted, and the act is the model's to undo once more.
    card("st:on");
    expect(ledger.target("act-1", aim(["modify_existing"], { ...STAR, state: "st:on" }))).toEqual({ kind: "admit", on: "own", allowed: ["modify_existing"] });
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ledger.inPlace().map((entry) => entry.act)).toEqual(["act-1"]);
  });
});

describe("an act an undo can still put back is unchanged (guard)", () => {
  it("a row new on a list the act named: still to undo, its removal admitted, and it settles restored", async () => {
    const ledger = after("keep", "Keep", ["modify_existing"], BOOK, [...ORIGINAL, ["s:atlas-copy", "v:unread"]]);
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ledger.inPlace()).toEqual([{ act: "act-1", call: "keep", did: "press \"Keep\" button", settle: "Destination-1 at loc:reading still differs from how the build found it: undo this act there, naming it under undoes." }]);
    expect(ledger.target("act-1", aim(["delete"], row("s:atlas-copy")))).toEqual({ kind: "admit", on: "subject", allowed: ["delete"] });
    ledger.explored(acted("remove", "Remove", ["delete"], row("s:atlas-copy"), { undoes: "act-1", on: "subject" }));
    readList(ledger, ORIGINAL);
    expect(ledger.standing("act-1")).toBe("restored");
    expect(await ledger.beforeTrial(compare)).toEqual({ kind: "admit" });
  });

  it("a change to a row whose own control is still there: still to undo, and a press on that row is admitted", () => {
    const ledger = after("mark", "Mark", ["modify_existing"], row("s:primer"), [["s:atlas", "v:unread"], ["s:primer", "v:done"]], false);
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ledger.inPlace().map((entry) => entry.act)).toEqual(["act-1"]);
    expect(ledger.target("act-1", aim(["modify_existing"], row("s:primer")))).toEqual({ kind: "admit", on: "own", allowed: [] });
  });

  it("two rows new on the list and two acts that may each remove one: both still to undo", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    readList(ledger, ORIGINAL);
    expect(ledger.destinationReceipts().map((receipt) => receipt.ref)).toEqual(["destination-1"]);
    ledger.explored(acted("keep", "Keep", ["create_new"], NEW_BOOK, { resetDestination: "destination-1" }));
    ledger.explored(acted("keep.2", "Keep", ["create_new"], { ...NEW_BOOK, subject: "s:digest", page: "s:digest" }, { resetDestination: "destination-1" }));
    readList(ledger, [...ORIGINAL, ["s:codex", "v:unread"], ["s:stray", "v:unread"]]);
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ledger.inPlace().map((entry) => entry.act)).toEqual(["act-1", "act-2"]);
  });
});
