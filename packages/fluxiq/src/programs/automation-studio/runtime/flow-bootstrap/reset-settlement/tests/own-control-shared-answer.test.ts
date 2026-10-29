import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetLedger,
  AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetRead,
  type AutomationStudioSiteResetTarget,
  type AutomationStudioSiteResetTrialAct
} from "../../site-reset/index.ts";

// t797 P4 item 1 (rerun round 6 `run-mvrj7qgf-a44a1427`, section 4 Decisive): whether an act's own control is back at its
// place is one answer (`../own-control.ts`), keyed by one place per act, and the undo admission
// (`../../reset-undo/admission.ts`) and the settlement (`../control-tracker.ts`, `../judge.ts`) both read it. In that run
// the settlement asked for a press back that the admission answered already back, for 110 steps, because the act's original
// sat at one place and its own control at another.
//
// So for every read of an act's own control, at its one place, the two agree:
// - the state the build found: the admission answers already back, and the act is settled or closed, never asked for;
// - the state the act set: the admission admits the press back as the act's own, and the act is asked for exactly that;
// - any third state, or its control gone from the page: the admission admits no press back, and the act is closed as one
//   no call can settle, never asked for a press.
//
// Made-up fixture: a library catalogue whose entries a reader reserves from each entry's own page; a looped trial step
// reserves one entry or both, in the explored brief's ledger or the supervisor's, whose tracker never pressed either entry.
// The web domain hashes a control's place from its page's address (distinct places); a site whose entries share one place
// token is swept too. Opaque tokens only.

const LIB = "r:library";
type Entry = { n: 1 | 2; scope: string; location: string; place: string };
const entry = (n: 1 | 2, places: "shared" | "distinct"): Entry => ({ n, scope: `p:entry-${n}`, location: `loc:entry-${n}`, place: places === "shared" ? "pl:reserve" : `pl:reserve-${n}` });
const read = (item: Entry, state: string | undefined): AutomationStudioSiteResetRead => ({ state: {}, differs: [], resource: LIB, scope: item.scope, location: item.location, controls: state === undefined ? {} : { [item.place]: { [state]: 1 } } });
const reserve = (item: Entry, state: string) => ({ effect: "mutate" as const, consequences: ["modify_existing" as const], control: { name: "Reserve", kind: "button", resource: LIB, place: item.place, state } });

type Shape = { places: "shared" | "distinct"; brief: "builder" | "supervisor"; pressed: 1 | 2; undone: boolean };
const shapes: Shape[] = [];
for (const places of ["shared", "distinct"] as const) for (const brief of ["builder", "supervisor"] as const) for (const pressed of [1, 2] as const) for (const undone of [false, true]) shapes.push({ places, brief, pressed, undone });

/** The shape's ledger after its trial (and, where `undone`, a landed press back), the pressed entry, and the act. */
function trial(shape: Shape): { ledger: AutomationStudioSiteResetLedger; item: Entry; act: string } {
  const explored = entry(1, shape.places), item = entry(shape.pressed, shape.places);
  const project = new AutomationStudioSiteResetProjectLedger();
  const builder = project.forBrief("builder");
  builder.observed(read(explored, "st:free"));
  const witness = builder.admitStep({ ...reserve(explored, "st:free"), control: { ...reserve(explored, "st:free").control, subject: "s:entry" } });
  expect(witness).toEqual({ via: "control", ref: "control-1" });
  const ledger = shape.brief === "builder" ? builder : project.forBrief("supervisor");
  const step: AutomationStudioSiteResetTrialAct = { step: 2, definitionId: "demo.reserve", consequences: ["modify_existing"], witness: witness!, spot: { resource: LIB, place: item.place, state: "st:free" }, controls: { page: item.scope, location: item.location, before: { "st:free": 1 }, after: { "st:held": 1 } } };
  const act = ledger.trialRan([step]).at(-1)!.act;
  if (shape.undone) {
    const undo = reserve(item, "st:held");
    expect(ledger.target(act, undo)).toMatchObject({ kind: "admit", on: "own" });
    ledger.explored({ callId: "back", toolId: "core.run_node", landed: true, undoes: act, on: "own", operation: "demo.press", declared: { permitted: true, ...undo, verb: "press" } });
  }
  return { ledger, item, act };
}

const code = (answer: AutomationStudioSiteResetTarget): string | undefined => (answer.kind === "refused" && typeof answer.evidence.code === "string" ? answer.evidence.code : undefined);

describe("the admission and the settlement give one answer for an act's own control, at its one place (t797 P4 item 1)", () => {
  it.each(shapes.map((shape) => [JSON.stringify(shape), shape] as const))("%s", (_name, shape) => {
    for (const fresh of ["st:free", "st:held", "st:waitlisted", undefined] as const) {
      const { ledger, item, act } = trial(shape);
      ledger.observed(read(item, fresh));
      const asked = ledger.inPlace().find((entry) => entry.act === act);
      const closed = ledger.unsatisfiable().some((entry) => entry.act === act);
      const where = `${JSON.stringify(shape)} read ${fresh ?? "without its control"}`;
      if (fresh === "st:free") {
        expect(code(ledger.target(act, reserve(item, fresh))), where).toBe("candidate.undo_already_back");
        expect(ledger.standing(act) === "restored" || closed, where).toBe(true);
        expect(asked, where).toBeUndefined();
      } else if (fresh === "st:held") {
        expect(asked?.settle, where).toContain("press that same control back");
        expect(asked?.settle, where).toContain(item.location);
        expect(ledger.target(act, reserve(item, fresh)), where).toMatchObject({ kind: "admit", on: "own" });
      } else {
        // No press back can be admitted here, so none is asked for: closed, with the condition it failed.
        if (fresh !== undefined) expect(ledger.target(act, reserve(item, fresh)), where).toMatchObject({ kind: "refused", evidence: { failed: "control_state_differs", canMeet: "no_call" } });
        expect(asked, where).toBeUndefined();
        expect(ledger.unsatisfiable(), where).toEqual([expect.objectContaining({ act, reason: "gate_unsatisfiable", failed: "no_admissible_undo" })]);
      }
    }
  });

  it("asks for a press back at the act's own entry only: the other entry's control, in either state, is never its own", () => {
    for (const places of ["distinct"] as const) {
      const { ledger, act } = trial({ places, brief: "supervisor", pressed: 2, undone: false });
      const other = entry(1, places);
      ledger.observed(read(entry(2, places), "st:held"));
      for (const state of ["st:free", "st:held"]) expect(ledger.target(act, reserve(other, state)), state).toMatchObject({ kind: "refused" });
    }
  });
});
