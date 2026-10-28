// What a trial act takes of its step's witness stamp (t751 R3), moved whole out
// of `./ledger.ts` (t772 w7, no change in behaviour), which calls it from
// `trialRan` for each trial act it records.
//
// A destination ref attaches that issued list, a repeated explored act lends
// its witnesses; a control receipt retains its immutable pre-act counts even
// without the optional runtime diff. Own-list admission emits a destination
// stamp. Bare standalone stamps add no authority.
//
// A control receipt covers only the item it was read on (t751 final
// acceptance, photo-dialog-act). A looped step carries the explored item's
// receipt into every pass, so a pass that pressed another item is witnessed
// instead by that item's own control as the pass's own diff (`pass`) read it
// just before its press (R1, per pass), at the pass's own place
// (`act.spot.place`, where that diff's counts were read), judged only on reads
// at its location. Another item is a pass whose own place is not the
// receipt's -- the web domain hashes a control's place from its page's
// address, so two items' controls have distinct places (t772, rerun round 6
// `run-mvrj7qgf-a44a1427`) -- or, where items share their control's place
// token, whose diff was read at another location (another page where none is
// given). Its original is never filed under the receipt's place, and its spot
// keeps its own place: filed there, no read of its item reports that place, so
// settlement asked to press back what the undo admission answered already
// back, forever. A pass on another item gets no original where its own place
// is unknown, or where the build had already pressed that item there
// (`itemPressed`): a later before is never an original (R1), and its own
// press's toggle, judged against its place's start, witnesses it. Where items
// share a place, a pressed item keeps the receipt as it did.
//
// That pass's own original is also its place's original for the whole build
// (t772 w9, headed photo-dialog-act), where no read or act of the build got
// there first (`./control-witnesses.ts`, `passed`). Its spot touches that
// place, so no later read can become its original: without this, a step on the
// same control (the item's own page, first opened after the trial) had no
// receipt, the trial door refused it unwitnessed, and that refusal hid the
// pass's act still to undo. Filed here, the step is stamped by what the build
// found, never by a read showing the pass's own press.

import { automationStudioSiteResetWitnessStampValid as stampValid } from "../reset-admission/index.ts";
import type { AutomationStudioSiteResetTrialAct } from "./contracts.ts";
import type { AutomationStudioSiteResetControlWitnesses } from "./control-witnesses.ts";
import type { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import type { AutomationStudioSiteResetLedgerAct } from "./ledger-act.ts";

/** Fills `act`'s witnesses from its step's stamp `witness` (header); a stamp that is not valid adds nothing. */
export function automationStudioSiteResetTrialStamp(
  act: AutomationStudioSiteResetLedgerAct,
  witness: unknown,
  receipts: { createBaselines: Pick<AutomationStudioSiteResetCreateBaselines, "retained">; controlWitnesses: Pick<AutomationStudioSiteResetControlWitnesses, "resolve" | "passed"> },
  pass?: AutomationStudioSiteResetTrialAct["controls"],
  itemPressed = false
): void {
  if (!stampValid(witness)) return;
  if (witness.via === "destination") {
    const named = receipts.createBaselines.retained(witness.ref);
    if (named && !act.destinations.some((entry) => entry.scope === named.scope)) act.destinations.push(named);
  } else if (witness.via === "repeats" && act.strictReset && !act.repeats.includes(witness.act)) {
    act.repeats.push(witness.act);
  } else if (witness.via === "control") {
    const stamped = receipts.controlWitnesses.resolve(witness.ref);
    if (!stamped) return;
    const own = act.spot?.place;
    // Its own place is not the receipt's: another item's control, whatever its diff says of where (header, t772).
    const elsewhere = own !== undefined && own !== stamped.place;
    // A pass withheld where the build had pressed that item already keeps the receipt where items share a place (header, R1).
    const passed = itemPressed && !elsewhere ? undefined : pass;
    const otherItem = elsewhere || (passed !== undefined && (passed.location !== undefined && stamped.location !== undefined ? passed.location !== stamped.location : passed.page !== stamped.page));
    if (!otherItem) {
      act.controlOriginal = stamped;
      act.spot = { ...act.spot, resource: stamped.resource, scope: stamped.page, place: stamped.place };
      return;
    }
    // Another item: its own press at its own place, never the receipt's place (header, t772).
    if (!passed || own === undefined || itemPressed) return;
    act.controlOriginal = { resource: stamped.resource, page: passed.page, place: own, before: { ...passed.before }, ...(passed.location !== undefined ? { location: passed.location, at: passed.location } : {}) };
    act.spot = { ...act.spot, resource: stamped.resource, scope: passed.page };
    // Its place's original for the build, where nothing got there first (header, t772 w9).
    receipts.controlWitnesses.passed({ resource: stamped.resource, page: passed.page, place: own, before: passed.before, ...(passed.location !== undefined ? { location: passed.location } : {}) });
  }
}
