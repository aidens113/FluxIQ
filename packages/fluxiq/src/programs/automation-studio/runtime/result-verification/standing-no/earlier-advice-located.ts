// What an earlier trial's advice is, to a later judge (P5b): only the defects
// Core located in its own record of that trial -- the kind and the row as Core
// located them -- said in Core's words (`./earlier-advice.ts`).
//
// **Why.** An earlier judge's prose advice, and its claims Core never located,
// anchored the next judge: a no answered for the very change an earlier no had
// asked for. The judge's words are never kept here; only what Core found stands
// (`./types.ts`, `located`). Generic words, naming no site or task.

import type { AutomationStudioResultStandingNoLocated } from "./types.ts";

/** The most defects said, and the most characters of one row. */
const MOST = 8;
const ROW_MOST = 80;

/** Core's sentence for the located defects, or nothing where none is (header). */
export function automationStudioResultLocatedAdvice(located: readonly AutomationStudioResultStandingNoLocated[] | undefined): string | undefined {
  const said = (located ?? []).filter((defect) => defect.kind !== "other").slice(0, MOST).map(defectWords);
  return said.length ? `Core located these defects in its record of that trial: ${said.join("; ")}.` : undefined;
}

function defectWords(defect: AutomationStudioResultStandingNoLocated): string {
  const row = defect.row.length > ROW_MOST ? `${defect.row.slice(0, ROW_MOST - 3)}...` : defect.row;
  switch (defect.kind) {
    case "kept_not_asked": return `it keeps "${row}", which the request does not ask for`;
    case "asked_missing": return `it lacks "${row}", which the request asks for`;
    case "wrong_value": return `"${row}" holds a wrong value${defect.column ? ` in column "${defect.column}"` : ""}`;
    case "act_missing": return `the requested act "${row}" was not done`;
    default: return `the act "${row}" was done wrongly`;
  }
}
