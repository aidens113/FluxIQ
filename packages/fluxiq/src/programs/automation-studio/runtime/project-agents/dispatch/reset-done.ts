// What a reset brief that left nothing to undo says it did (t684).
//
// A reset comes back `done` once no act of the build is still to undo
// (`./ending.ts`, `./run-brief.ts`). "Still to undo" leaves out an act the
// ledger kept -- one the reset named under `cannotUndo`, or whose undo was
// refused as aimed at another item (`candidate.undo_wrong_target`) -- and an
// act of a class no control of the site takes back (money moved, a message
// sent). Its `done` used to say "Every lasting act this build made is undone;
// the site is as the build found it" all the same: on the t679 recipe case a
// trial's save stayed in the box, the reset said so, and the whole trial ran
// on it. A reset's words now never say every act is undone while one stays:
// each act that stayed is named by its id and what it did, with why no reset
// undoes it, in the words `../supervisor/left-on-target.ts` gives an ending.
//
// **Why it stayed is read off where the act stands** (L1 reset settlement):
// its ledger's `standing`. An act settled `unchanged` -- fresh complete reads
// of everything it could change showed no change -- stayed with nothing seen
// of it; a legacy act `kept` stayed because this build could not undo it
// (below); an `irreversible` one because no control of the site takes its
// class back.
//
// **An act is named in words, and one nothing showed is not called left (t738).**
// Everything-store `run-mvgf04kw-310fc169` said "13 lasting acts of this build
// stay on the site, so the site is not as the build found it: act-9, act-11,
// act-12 ...", ids no person reads, and every act it listed had settled
// `unchanged`: no read ever showed it change anything. Each act is now said by
// its verb and control name, those no name says counted
// (`activity/wording/act-words.ts`), and an act settled `unchanged` is said
// apart, as one that may not have changed anything: it never makes the site
// "not as the build found it".
//
// **A kept act is said as not undone, never as beyond the site (t741 B5).** A
// legacy act `kept` is of a reversible class: the model named it under
// `cannotUndo`, or its undo was refused as aimed at another item. It was said
// "(the site offers no way to undo it)" and as making the site "not as the
// build found it", which nobody knew: photo-social `run-mvgobp8h-b99ede98`
// read its control back as before. It is now said as an act this build could
// not undo, which may still be on the site. Only an `irreversible` act, of a
// class no site control takes back, makes the site not as the build found it.
//
// **An act no call can settle is said as left (t743, S2).** Such an act
// (`unsatisfiable()`, `flow-bootstrap/site-reset/ledger.ts`: its only witness a
// list Core cannot read again, or nothing left to name for it) is never among
// the acts in place, since no reset is asked to undo it, and was said as if
// undone. It is now said apart, as one that can no longer be checked or put
// back and so may still be on the site; its reset then comes back blocked
// (`./ending.ts`, `gateUnsatisfiable`).

import { automationStudioActivityActsSaid } from "../../activity/wording/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";

/** A reset's `done` when nothing of the build stayed on the site. */
const ALL_UNDONE = "Every lasting act this build made is undone; the site is as the build found it.";
/** How many acts of each kind are named; the rest are counted, so the reason stays within the return's length. */
const MAX_NAMED = 10;

/** Why an act of a class no site control takes back stayed on the site (header). */
const IRREVERSIBLE = "(FluxIQ cannot undo it)";

/** `items`, the first `MAX_NAMED` by name and the rest counted. */
function listed(items: readonly string[]): string {
  const named = items.slice(0, MAX_NAMED);
  const more = items.length - named.length;
  return `${named.join(", ")}${more ? `, and ${more} more` : ""}`;
}

/** The words of a reset that came back `done`, naming each act of the build that stayed in place, or that nothing showed changing (header). */
export function automationStudioProjectDispatchResetDone(ledger: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief" | "unsatisfiable">): string {
  const stayed: Array<{ did: string; note: string }> = [];
  const kept: Array<{ did: string }> = [];
  const quiet: Array<{ did: string }> = [];
  // Never in place, yet still on the site: said apart (header, t743).
  const unsettleable = new Set(ledger.unsatisfiable().map((act) => act.act));
  const unchecked: Array<{ did: string }> = [];
  for (const act of ledger.snapshot().acts) {
    if (act.possible === true || act.inPlace) continue;
    if (unsettleable.has(act.act)) {
      unchecked.push({ did: act.did });
      continue;
    }
    const standing = ledger.forBrief(act.owner).standing(act.act) ?? "";
    if (standing === "irreversible") stayed.push({ did: act.did, note: IRREVERSIBLE });
    else if (standing === "kept") kept.push({ did: act.did });
    else if (standing === "unchanged") quiet.push({ did: act.did });
  }
  if (!stayed.length && !kept.length && !quiet.length && !unchecked.length) return ALL_UNDONE;
  const unchanged = quiet.length
    ? `${quiet.length === 1 ? "1 act" : `${quiet.length} acts`} of this build showed no change on the site, so ${quiet.length === 1 ? "it" : "they"} may not have changed anything: ${listed(automationStudioActivityActsSaid(quiet).map((act) => act.words))}.`
    : "";
  // Left on the site as far as anyone can tell: no call can check or put it back (header, t743).
  const leftUnchecked = unchecked.length
    ? `${unchecked.length === 1 ? "1 act" : `${unchecked.length} acts`} of this build can no longer be checked or put back, so ${unchecked.length === 1 ? "it" : "they"} may still be on the site: ${listed(automationStudioActivityActsSaid(unchecked).map((act) => act.words))}.`
    : "";
  if (!stayed.length && !kept.length) return unchecked.length ? ["This reset undid every act of this build it could.", leftUnchecked, unchanged].filter((sentence) => sentence).join(" ") : `Every act of this build that showed a change is undone. ${unchanged}`;
  const count = `${stayed.length} lasting act${stayed.length === 1 ? "" : "s"} of this build ${stayed.length === 1 ? "stays" : "stay"} on the site`;
  // Known only to be not undone: it may still be there, and the site may be as the build found it (header, t741 B5).
  const notUndone = kept.length
    ? `${kept.length === 1 ? "1 act" : `${kept.length} acts`} of this build could not be undone, so ${kept.length === 1 ? "it" : "they"} may still be on the site: ${listed(automationStudioActivityActsSaid(kept).map((act) => act.words))}.`
    : "";
  const left = stayed.length
    ? `This reset undid every act of this build it could, but ${count}, so the site is not as the build found it: ${listed(automationStudioActivityActsSaid(stayed).map((act) => act.words))}.`
    : "This reset undid every act of this build it could.";
  return [left, notUndone, leftUnchecked, unchanged].filter((sentence) => sentence).join(" ");
}
