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
// of it; a legacy act `kept` stayed because the site offers no way to undo it;
// an `irreversible` one because no control of the site takes its class back.

import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";

/** A reset's `done` when nothing of the build stayed on the site. */
const ALL_UNDONE = "Every lasting act this build made is undone; the site is as the build found it.";
/** How many acts that stayed are named; the rest are counted, so the reason stays within the return's length. */
const MAX_NAMED = 10;

/** Why an act stayed on the site, by where it stands (header); a standing absent here did not stay. */
const STAYED: Partial<Record<string, string>> = {
  unchanged: "nothing it could change showed a change",
  kept: "the site offers no way to undo it",
  irreversible: "FluxIQ cannot undo it"
};

/** The words of a reset that came back `done`, naming each act of the build that stayed in place (header). */
export function automationStudioProjectDispatchResetDone(ledger: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief">): string {
  const stayed: string[] = [];
  for (const act of ledger.snapshot().acts) {
    if (act.possible === true || act.inPlace) continue;
    const why = STAYED[ledger.forBrief(act.owner).standing(act.act) ?? ""];
    if (why) stayed.push(`${act.act} (${act.did}; ${why})`);
  }
  if (!stayed.length) return ALL_UNDONE;
  const named = stayed.slice(0, MAX_NAMED);
  const more = stayed.length - named.length;
  const count = `${stayed.length} lasting act${stayed.length === 1 ? "" : "s"} of this build ${stayed.length === 1 ? "stays" : "stay"} on the site`;
  return `This reset undid every act of this build it could, but ${count}, so the site is not as the build found it: ${named.join(", ")}${more ? `, and ${more} more` : ""}.`;
}
