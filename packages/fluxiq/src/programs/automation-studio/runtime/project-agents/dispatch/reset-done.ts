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

import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";

/** A reset's `done` when nothing of the build stayed on the site. */
const ALL_UNDONE = "Every lasting act this build made is undone; the site is as the build found it.";
/** How many acts that stayed are named; the rest are counted, so the reason stays within the return's length. */
const MAX_NAMED = 10;

/** The words of a reset that came back `done`, naming each act of the build that stayed in place (header). */
export function automationStudioProjectDispatchResetDone(ledger: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief">): string {
  const stayed: string[] = [];
  for (const act of ledger.snapshot().acts) {
    if (act.possible === true || act.inPlace) continue;
    if (!act.undoable) stayed.push(`${act.act} (${act.did}; FluxIQ cannot undo it)`);
    else if (kept(ledger, act.act, act.owner)) stayed.push(`${act.act} (${act.did}; the site offers no way to undo it)`);
  }
  if (!stayed.length) return ALL_UNDONE;
  const named = stayed.slice(0, MAX_NAMED);
  const more = stayed.length - named.length;
  const count = `${stayed.length} lasting act${stayed.length === 1 ? "" : "s"} of this build ${stayed.length === 1 ? "stays" : "stay"} on the site`;
  return `This reset undid every act of this build it could, but ${count}, so the site is not as the build found it: ${named.join(", ")}${more ? `, and ${more} more` : ""}.`;
}

/** The act's own brief's ledger kept it: no reset is asked for it again (`../supervisor/left-on-target.ts`). */
function kept(ledger: Pick<AutomationStudioSiteResetProjectLedger, "forBrief">, act: string, owner: string): boolean {
  const claim = ledger.forBrief(owner).claim(act);
  return claim.kind === "refused" && claim.evidence.code === "candidate.undo_act_kept";
}
