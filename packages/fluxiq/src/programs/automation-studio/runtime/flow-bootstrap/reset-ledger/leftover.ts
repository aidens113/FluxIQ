// What one act of this build left on the site, as settlement answers it (t772
// w7; rerun round 6 `run-mvrj7qgf-a44a1427`, where the ending told the person a
// change was still on the site that a fresh read showed put back, round 4's
// wrong ending again).
//
// The ledger's settlement answers -- the acts to undo (`inPlace`) and the acts
// no call can settle, listed apart (`unsatisfiable`) -- and its record of what
// is left -- `standing`, `leftover`, a project build's snapshot
// (`../site-reset/project-ledger.ts`) and the acts a trial returns as left on the site
// (`trialRan`) -- were each worked out on their own, so one could say left what
// another said settled: `standing` said `in_place` of an act listed apart, and a
// trial returned an act settled `unchanged` as left. Every one of them now reads
// this one function, so they agree by construction (`./answers.ts`, `leftOf`):
//
// - `no`: settlement answered it `restored` (an undo of it settled, or a start
//   hook took it back), or settled it `unchanged` -- fresh complete reads of
//   everything it could change never showed a change, so it is left unchanged,
//   never said to be left; and a legacy act whose page showed nothing of it.
// - `yes`: still open and the model's to undo (`in_place`); or of a class no
//   control of the site takes back (`irreversible`).
// - `possibly`: closed as one no call can settle (`unsettleable`,
//   `gate_unsatisfiable`), with the closed condition it failed (`failed`): no
//   read can show it gone and none is asked for, so it may still be there; a
//   legacy act the build kept (`kept`); a press that declared no lasting class
//   but changed its page (`possible`, t593).
//
// Pure: the ledger settles the act first, and `unmet` is asked only of an act
// still open, as the settlement asks it.

import type { AutomationStudioSiteResetUnmet } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetLedgerAct } from "./act.ts";

/** Whether an act is left on the site, and where it stands (header). */
export type AutomationStudioSiteResetLeftover =
  | { left: "no"; standing: "restored" | "unchanged" }
  | { left: "yes"; standing: "in_place" | "irreversible" }
  | { left: "possibly"; standing: "unsettleable"; failed: AutomationStudioSiteResetUnmet }
  | { left: "possibly"; standing: "kept" | "possible" };

/**
 * Where `act` stands (header), already settled where it could be: `irreversible` whether its class is one no site control
 * takes back; `unmet` the closed condition an open act fails where no call can settle it, asked last.
 */
export function automationStudioSiteResetLeftover(
  act: Pick<AutomationStudioSiteResetLedgerAct, "undoable" | "undone" | "settled" | "possible" | "kept" | "strictReset">,
  irreversible: boolean,
  unmet: () => AutomationStudioSiteResetUnmet | undefined
): AutomationStudioSiteResetLeftover {
  if (!act.undoable) return irreversible ? { left: "yes", standing: "irreversible" } : { left: "no", standing: "unchanged" };
  if (act.undone) return { left: "no", standing: "restored" };
  if (act.settled === "unchanged") return { left: "no", standing: "unchanged" };
  if (act.possible) return { left: "possibly", standing: "possible" };
  if (act.kept && !act.strictReset) return { left: "possibly", standing: "kept" };
  const failed = unmet();
  return failed ? { left: "possibly", standing: "unsettleable", failed } : { left: "yes", standing: "in_place" };
}
