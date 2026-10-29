import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_FAILED } from "../../reset-answers/index.ts";
import {
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetExplored,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetSpot,
  type AutomationStudioSiteResetTarget,
  type AutomationStudioSiteResetTrialAct
} from "../index.ts";

// t797 P4 item 4 (rerun round 6 debugs `run-mvrj7qgf-a44a1427` section 4 and `run-mvrj7qg8-6916b3f7` cause 1): every act a
// ledger lists to undo (`inPlace`, `actsToUndo`) has at least one call that the undo admission admits and that its own
// `settle` words name; an act with none is listed apart (`unsatisfiable`, `gate_unsatisfiable`) with what it did, the call
// that made it and the closed condition it failed. So no answer leaves the model a press that every admission refuses.
//
// A property-style sweep over ledger states drives the real ledger. Each state is replayed from scratch for each call tried,
// since an admission may write to an act (a subject undo, a refused press back).
//
// Made-up fixtures, a library site, opaque tokens only:
// - catalogue entries a reader reserves from each entry's own page. The web domain hashes a control's place from its page's
//   address, so each entry's Reserve has a place of its own (`distinct`); a site whose controls share one place token is
//   swept too (`shared`). A looped trial step reserves one entry or both, in the explored brief's ledger or in the
//   supervisor's, whose tracker never pressed either entry;
// - a pickup page whose "Use this branch" confirms a chosen branch and reloads to the same address, replacing the branch the
//   page shows (`modify_existing`, the 6916 shape), with or without the shown values the domain reports.

const LIB = "r:library";
const RESERVE_STATES = ["st:free", "st:held", "st:waitlisted"] as const;
type Entry = { n: 1 | 2; scope: string; location: string; place: string };
const entry = (n: 1 | 2, places: "shared" | "distinct"): Entry => ({ n, scope: `p:entry-${n}`, location: `loc:entry-${n}`, place: places === "shared" ? "pl:reserve" : `pl:reserve-${n}` });
/** An entry page read showing its Reserve in `state`, or no Reserve at all (`gone`: the page draws another control instead). */
const entryRead = (item: Entry, state: string | "gone"): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIB, scope: item.scope, location: item.location, controls: state === "gone" ? {} : { [item.place]: { [state]: 1 } } });
const reserve = (item: Entry, state: string) => ({ effect: "mutate" as const, consequences: ["modify_existing" as const], control: { name: "Reserve", kind: "button", resource: LIB, place: item.place, state } });
const look = (): Candidate["declared"] => ({ effect: "observe", consequences: [], control: {} });
const ran = (callId: string, undoes: string, on: NonNullable<AutomationStudioSiteResetExplored["on"]>, declared: { effect: "mutate"; consequences: readonly AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot & { name: string | null; kind: string } }, extra: Partial<AutomationStudioSiteResetExplored> = {}): AutomationStudioSiteResetExplored =>
  ({ callId, toolId: "core.run_node", landed: true, undoes, on, operation: "demo.press", declared: { permitted: true, ...declared, consequences: [...declared.consequences], verb: "press" }, ...extra });

/** A call the sweep may try for an open act, with the admission it must get for the words it answers (`press`: a lasting undo; `look`: any). */
type Candidate = { declared: Parameters<AutomationStudioSiteResetLedger["target"]>[1]; kind: "press" | "look" };
/** One ledger state: how to build it again, and the calls a person could make on the page it ends on. */
type State = { name: string; build: () => AutomationStudioSiteResetLedger; candidates: Candidate[] };

/** The words an open act is told, as the kind of call they name (`./../../reset-settlement/words.ts`). */
function named(settle: string): Array<"press" | "look"> {
  const kinds = new Set<"press" | "look">();
  if (/press that same control back|set it back where it shows|undo this act there/u.test(settle)) kinds.add("press");
  if (/again|name that list's ref/u.test(settle)) kinds.add("look");
  return [...kinds];
}

const admitted = (answer: AutomationStudioSiteResetTarget, kind: "press" | "look"): boolean => answer.kind === "admit" && (kind === "look" || (answer.on !== "moving" && answer.on !== "step"));

/** The invariant (header), checked on `state`; returns what broke it, or nothing. */
function broken(state: State): string[] {
  const failures: string[] = [];
  const ledger = state.build();
  const toUndo = ledger.inPlace();
  const apart = ledger.unsatisfiable();
  for (const entry of apart) {
    if (!entry.did.trim() || entry.reason !== "gate_unsatisfiable" || !(AUTOMATION_STUDIO_SITE_RESET_FAILED as readonly string[]).includes(entry.failed)) failures.push(`${entry.act}: listed apart without what it did and what it failed`);
    if (toUndo.some((act) => act.act === entry.act)) failures.push(`${entry.act}: both to undo and listed apart`);
  }
  for (const act of toUndo) {
    const settle = act.settle ?? "";
    const kinds = named(settle);
    if (!kinds.length) {
      failures.push(`${act.act}: to undo, and its words name no call: ${JSON.stringify(settle)}`);
      continue;
    }
    for (const kind of kinds) {
      const tried = state.candidates.filter((candidate) => candidate.kind === kind);
      // Replayed per call: an admission may write to the act.
      if (!tried.some((candidate) => admitted(state.build().target(act.act, candidate.declared), kind))) failures.push(`${act.act}: its words name a ${kind} no admission admits: ${JSON.stringify(settle)}`);
    }
  }
  return failures;
}

// Family 1: a looped Reserve over two catalogue entries (the a44a shape).
type LoopShape = { places: "shared" | "distinct"; brief: "builder" | "supervisor"; passes: "first" | "second" | "both"; seenSet: boolean; undo: boolean; fresh: "st:free" | "st:held" | "st:waitlisted" | "gone" };
function loopState(shape: LoopShape): State {
  const one = entry(1, shape.places), two = entry(2, shape.places);
  const pressed = shape.passes === "first" ? [one] : shape.passes === "second" ? [two] : [one, two];
  const build = (): AutomationStudioSiteResetLedger => {
    const project = new AutomationStudioSiteResetProjectLedger();
    const builder = project.forBrief("builder");
    builder.observed(entryRead(one, "st:free"));
    const witness = builder.admitStep({ ...reserve(one, "st:free"), control: { ...reserve(one, "st:free").control, subject: "s:entry" } });
    const ledger = shape.brief === "builder" ? builder : project.forBrief("supervisor");
    const acts: AutomationStudioSiteResetTrialAct[] = pressed.map((item, index) => ({ step: 2, ...(pressed.length > 1 ? { pass: { number: index + 1, of: pressed.length } } : {}), definitionId: "demo.reserve", consequences: ["modify_existing"], ...(witness ? { witness } : {}), spot: { resource: LIB, place: item.place, state: "st:free" }, controls: { page: item.scope, location: item.location, before: { "st:free": 1 }, after: { "st:held": 1 } } }));
    const named = ledger.trialRan(acts);
    for (const item of pressed) {
      const act = named.find((entry) => entry.did.includes(pressed.length > 1 ? `pass ${pressed.indexOf(item) + 1} of` : "trial step 2"))?.act;
      if (shape.seenSet) ledger.observed(entryRead(item, "st:held"));
      if (shape.undo && act) {
        const undo = reserve(item, "st:held");
        if (ledger.target(act, undo).kind === "admit") ledger.explored(ran(`back-${item.n}`, act, "own", undo));
      }
      ledger.observed(entryRead(item, shape.fresh));
    }
    return ledger;
  };
  // A person on each pressed entry's page can look, or press what that page shows.
  const candidates: Candidate[] = [{ declared: look(), kind: "look" }, ...(shape.fresh === "gone" ? [] : pressed.flatMap((item) => (["press", "look"] as const).map((kind) => ({ declared: reserve(item, shape.fresh), kind }))))];
  return { name: `loop ${JSON.stringify(shape)}`, build, candidates };
}

const loopShapes: LoopShape[] = [];
for (const places of ["shared", "distinct"] as const)
  for (const brief of ["builder", "supervisor"] as const)
    for (const passes of ["first", "second", "both"] as const)
      for (const seenSet of [false, true])
        for (const undo of [false, true])
          for (const fresh of ["st:free", "st:held", "st:waitlisted", "gone"] as const) loopShapes.push({ places, brief, passes, seenSet, undo, fresh });

// Family 2: a reloading `modify_existing` press on a pickup page (the 6916 shape).
const PICKUP = "p:pickup", AT = "loc:pickup";
/** The act's own control: "Use this branch", which confirms the chosen branch and reloads the page to its address. */
const CONFIRM: AutomationStudioSiteResetSpot = { resource: LIB, scope: PICKUP, place: "pl:confirm", state: "st:ready" };
/** The branch first chosen: its option sits in a list of its own. */
const MAIN: AutomationStudioSiteResetSpot = { resource: LIB, scope: "p:branches", item: "i:main", place: "pl:branch-radios", state: "st:main-off" };
const pickup = (branch: string, values: boolean): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIB, scope: PICKUP, location: AT, controls: { "pl:confirm": { "st:ready": 1 } }, ...(values ? { values: { "pl:branch": branch, "pl:main-label": "v:main", "pl:east-label": "v:east" } } : {}) });
const shelfRead = (): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIB, scope: "p:shelf-page", location: "loc:shelf", collections: [{ scope: "p:shelf", group: "g:shelf", subjects: ["s:atlas"], states: { "s:atlas": "v:atlas" } }] });
const aim = (consequences: AutomationStudioActionConsequence[], control: AutomationStudioSiteResetSpot) => ({ effect: "mutate" as const, consequences, control: { name: "Press", kind: "button", ...control } });
type ValueShape = { values: boolean; listBefore: boolean; steps: "none" | "chosen" | "confirmed"; fresh: "v:main" | "v:east" };
function valueState(shape: ValueShape): State {
  const build = (): AutomationStudioSiteResetLedger => {
    const ledger = new AutomationStudioSiteResetLedger();
    if (shape.listBefore) ledger.observed(shelfRead());
    ledger.observed(pickup("v:main", shape.values));
    ledger.explored({ callId: "use-east", toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, ...aim(["modify_existing"], CONFIRM), verb: "press" } });
    ledger.observed(pickup("v:east", shape.values));
    ledger.placed("act-1", { state: {}, location: AT, changed: ["branch"], ...(shape.values ? { values: { page: PICKUP, location: AT, replaced: [{ place: "pl:branch", from: "v:main", to: "v:east" }] } } : {}) });
    if (shape.steps !== "none") {
      const step = ledger.target("act-1", aim([], MAIN));
      if (step.kind === "admit") ledger.explored(ran("pick-main", "act-1", step.on, aim([], MAIN)));
    }
    if (shape.steps === "confirmed") {
      const own = ledger.target("act-1", aim(["modify_existing"], CONFIRM));
      if (own.kind === "admit") ledger.explored(ran("use-main", "act-1", own.on, aim(["modify_existing"], CONFIRM)));
    }
    ledger.observed(pickup(shape.fresh, shape.values));
    return ledger;
  };
  const candidates: Candidate[] = [
    { declared: look(), kind: "look" },
    ...[[], ["modify_existing"]].flatMap((consequences) => [CONFIRM, MAIN].map((control) => ({ declared: aim(consequences as AutomationStudioActionConsequence[], control), kind: "press" as const })))
  ];
  return { name: `value ${JSON.stringify(shape)}`, build, candidates };
}

const valueShapes: ValueShape[] = [];
for (const values of [true, false])
  for (const listBefore of [false, true])
    for (const steps of ["none", "chosen", "confirmed"] as const)
      for (const fresh of ["v:main", "v:east"] as const) valueShapes.push({ values, listBefore, steps, fresh });

describe("every act to undo has a call its words name that the admission admits; otherwise it is listed apart (t797 P4 item 4)", () => {
  it.each(loopShapes.map((shape) => [loopState(shape).name, loopState(shape)] as const))("%s", (_name, state) => {
    expect(broken(state)).toEqual([]);
  });

  it.each(valueShapes.map((shape) => [valueState(shape).name, valueState(shape)] as const))("%s", (_name, state) => {
    expect(broken(state)).toEqual([]);
  });

  it("is not vacuous: the sweep holds open acts to undo, acts listed apart, and both kinds of words", () => {
    const states = [...loopShapes.map(loopState), ...valueShapes.map(valueState)];
    const ledgers = states.map((state) => state.build());
    expect(ledgers.some((ledger) => ledger.inPlace().some((act) => /press that same control back/u.test(act.settle ?? "")))).toBe(true);
    expect(ledgers.some((ledger) => ledger.inPlace().some((act) => /set it back where it shows/u.test(act.settle ?? "")))).toBe(true);
    expect(ledgers.some((ledger) => ledger.unsatisfiable().length > 0)).toBe(true);
    expect(ledgers.some((ledger) => ledger.inPlace().length === 0 && ledger.unsatisfiable().length === 0)).toBe(true);
  });
});

describe("the honest exits the invariant gives (t797 P4 item 4)", () => {
  it("lists apart, never to undo, an act whose own control a fresh read shows in a third state: no press back is admitted there", () => {
    const state = loopState({ places: "distinct", brief: "supervisor", passes: "second", seenSet: true, undo: false, fresh: "st:waitlisted" });
    const ledger = state.build();
    expect(ledger.inPlace()).toEqual([]);
    expect(ledger.unsatisfiable()).toEqual([{ act: "act-1", did: expect.stringContaining("trial step 2"), reason: "gate_unsatisfiable", failed: "no_admissible_undo" }]);
    // A trial is never refused for it: it is said as one no call can settle (t775).
    expect(ledger.standing("act-1")).toBe("unsettleable");
  });

  it("lists apart an act whose own control a fresh read no longer shows at its place, and takes it back to undo once it shows the state the act set", () => {
    const one = entry(2, "distinct");
    const state = loopState({ places: "distinct", brief: "builder", passes: "second", seenSet: false, undo: false, fresh: "gone" });
    const ledger = state.build();
    expect(ledger.unsatisfiable().map((entry) => entry.act)).toEqual(["act-1"]);
    ledger.observed(entryRead(one, "st:held"));
    expect(ledger.unsatisfiable()).toEqual([]);
    expect(ledger.inPlace()[0]?.settle).toContain("press that same control back");
    expect(ledger.target("act-1", reserve(one, "st:held"))).toMatchObject({ kind: "admit", on: "own" });
  });

  it("names the call that made an explored act it lists apart", () => {
    const ledger = new AutomationStudioSiteResetLedger();
    const item = entry(1, "distinct");
    ledger.observed(entryRead(item, "st:free"));
    ledger.explored({ callId: "reserve-1", toolId: "core.run_node", landed: true, operation: "demo.press", declared: { permitted: true, ...reserve(item, "st:free"), control: { ...reserve(item, "st:free").control, page: "s:entry-1" }, verb: "press" } });
    ledger.observed(entryRead(item, "st:held"));
    expect(ledger.inPlace().map((act) => act.act)).toEqual(["act-1"]);
    ledger.observed(entryRead(item, "st:waitlisted"));
    expect(ledger.unsatisfiable()).toEqual([{ act: "act-1", did: expect.stringContaining("Reserve"), call: "reserve-1", reason: "gate_unsatisfiable", failed: "no_admissible_undo" }]);
  });
});
