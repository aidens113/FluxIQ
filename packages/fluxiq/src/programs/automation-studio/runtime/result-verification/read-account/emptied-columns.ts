// The columns a read's own conditions keep empty.
//
// A read that keeps only the rows where a column has no value stores that
// column empty in every row, by design: `run-muq66ff9-cb3767a1` kept `ad` as a
// column and filtered on `ad is absent`, and Core's always-empty finding told
// every re-author to "re-point" a column that was empty because the request
// asked for exactly that (`repair-directive.ts`). A column empty for a reason
// the read itself states is not a defect, so the finding leaves it out.
//
// The condition is read as `condition.ts` says it, which names a condition's
// value by the column key wherever it is the column -- by `field`, or by a read
// identical to the column's own -- and spells each relation as written. So a
// condition that keeps only rows lacking the column reads, whole, as one of the
// phrases below after the column key, and nothing else does: a condition naming
// its value by its own read says `attribute ...` or `the item's ...`, which
// holds a space no column key can, and a presence test cannot be said beside a
// comparison (the domain's grammar refuses that condition). Wording withheld by
// a screen is no evidence, so its column keeps the finding.

import type { AutomationStudioResultReadAccount } from "../contracts.ts";

/** What follows the column key in a condition that keeps only the rows with nothing in that column. */
const EMPTYING_RELATIONS: readonly string[] = ["is absent", "not is present", "equals \"\"", "equals [\"\"]"];

/** Of `columns`, the ones some read's own condition requires to be empty, in `columns` order. */
export function automationStudioResultReadEmptiedColumns(reads: readonly AutomationStudioResultReadAccount[] | undefined, columns: readonly string[]): string[] {
  const said = new Set((reads ?? []).flatMap((read) => (read.conditions ?? []).map((condition) => condition.condition)).filter((text): text is string => text !== undefined));
  return columns.filter((column) => EMPTYING_RELATIONS.some((relation) => said.has(`${column} ${relation}`)));
}
