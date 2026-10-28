// What one act was about on one list group (t772 w11): its own subjects
// (`./act-subjects.ts`) and, on the group its undo was admitted on as a subject
// inverse, the subject that undo removes (`subjectUndo`).
//
// A press from an item's own page is often about nothing that tells the items
// apart: its control's subject is the part around it, the same on every item's
// page, and the page may carry no subject of its own. Its row on the list it
// adds to is then no subject of the act's, so one act on a shared list could
// never settle by its own subjects (`./group-witness.ts`, t772 w10), and every
// act stayed open while any one row showed (headed job-undo-redraws-on-load:
// two acts whose rows were gone were still named to undo). Its undo's admission
// proves which row is its own there: a subject that list, named for the act and
// read complete before it, did not hold, and holds after it
// (`../site-reset/undo-admission.ts`, destination removal, t743). That row is
// the act's own on that group, for the act's witness and for the acts a
// difference there may be put down to (`./judge.ts`, `othersOn`), and on no
// other group. Pure.

import { automationStudioSiteResetActSubjects as actSubjects } from "./act-subjects.ts";
import type { AutomationStudioSiteResetSettlementSpot } from "./spot.ts";

/** `act`'s own subjects on `group` (header): its spot's, and the subject its admitted subject undo removes where that undo is on `group`. */
export function automationStudioSiteResetGroupSubjects(act: { spot?: AutomationStudioSiteResetSettlementSpot | undefined; subjectUndo?: { group: string; subject?: string | undefined } | undefined }, group: string): string[] {
  const own = actSubjects(act.spot);
  const proved = act.subjectUndo?.group === group ? act.subjectUndo.subject : undefined;
  return proved === undefined || own.includes(proved) ? own : [...own, proved];
}
