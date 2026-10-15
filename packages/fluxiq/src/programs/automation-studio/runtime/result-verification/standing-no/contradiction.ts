// Whether a later trial's no asks for exactly what an earlier standing no of
// the same build refused (t633, `./index.ts`).
//
// **What Core measures, and only that.** An earlier revision's trial stood
// judged no, and that no called stored rows not the kind of thing the request
// asks for (`upheldKind`). A later revision's trial is judged no, and every no
// of it that stands asks only to remove conditions (`drops`). That no is
// contradicted by the build's own record when, for some such earlier revision:
//
// - the later revision stores none of those rows, and Core holds every row it
//   stored (`storedWhole`);
// - every condition each no asks to remove is one the later revision reads
//   with and the earlier one did not;
// - without them, the later revision reads with no condition the earlier one
//   lacked: the remedy takes the read back to conditions that kept those rows;
// - and no condition it keeps left one of those rows out by itself, which
//   removing the others would not bring back.
//
// Conditions are compared by their wording (`./record.ts`), never by number
// or node id, which change between revisions. Nothing here says the later
// revision is right: a contradicted no is not taken, which leaves its trial
// unsure, never a yes. Whether the rows were rightly called not the asked kind
// stays the earlier judges'; Core holds the build to what its own record says
// they answered.

import type { AutomationStudioResultStandingNoContradiction, AutomationStudioResultStandingNoRecord } from "./types.ts";

/** The finding against `later` (header), from the latest earlier revision it holds for; nothing where none does. */
export function automationStudioResultStandingNoContradicted(
  earlier: ReadonlyArray<{ revision: number; record: AutomationStudioResultStandingNoRecord }>,
  later: AutomationStudioResultStandingNoRecord
): AutomationStudioResultStandingNoContradiction | undefined {
  if (!later.storedWhole || !later.standing.length || later.standing.some((call) => !call.drops?.length)) return undefined;
  const laterKeys = keysOf(later);
  if (!laterKeys) return undefined;
  const dropped = new Set(later.standing.flatMap((call) => call.drops ?? []));
  for (const { revision, record } of [...earlier].reverse()) {
    const rows = record.upheldKind ?? [];
    const earlierKeys = keysOf(record);
    if (!rows.length || !earlierKeys || rows.some((row) => later.stored.includes(row))) continue;
    const backToEarlier = later.standing.every((call) => {
      const drops = new Set(call.drops);
      return [...drops].every((key) => laterKeys.has(key) && !earlierKeys.has(key)) && [...laterKeys].every((key) => drops.has(key) || earlierKeys.has(key));
    });
    if (!backToEarlier) continue;
    const keptLeavesOut = later.conditions.some((condition) => condition.key !== undefined && !dropped.has(condition.key) && (condition.leftOutAlone ?? []).some((label) => rows.includes(label)));
    if (keptLeavesOut) continue;
    const conditions = [...new Set(later.conditions.filter((condition) => condition.key !== undefined && dropped.has(condition.key)).map((condition) => condition.name))];
    return { revision, rows: rows.length, conditions, said: said(revision, rows.length, conditions) };
  }
  return undefined;
}

/** Every condition's key; none where one has no wording to compare. */
function keysOf(record: AutomationStudioResultStandingNoRecord): Set<string> | undefined {
  if (record.conditions.some((condition) => condition.key === undefined)) return undefined;
  return new Set(record.conditions.map((condition) => condition.key!));
}

/** Core's words (header): the revisions, the conditions by Core's names, and a count of rows, never their labels. Generic words. */
function said(revision: number, rows: number, conditions: readonly string[]): string {
  const them = conditions.length === 1 ? conditions[0]! : `${conditions.slice(0, -1).join(", ")} and ${conditions.at(-1)!}`;
  const what = rows === 1 ? "a row" : `${rows} rows`;
  const it = rows === 1 ? "it" : "them";
  return `Core's record of this build contradicts this no. Revision ${revision}, read without ${them}, stored ${what} that the no standing on its trial called not the kind of thing the request asks for; `
    + `this revision reads with ${conditions.length === 1 ? "it" : "them"} and stores none of ${it}. Removing ${them}, as this no asks, would bring back exactly what answered that earlier no, `
    + "so this no is not taken: the verdict is unsure, not no.";
}
