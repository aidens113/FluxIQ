// The column a settled condition may be named by: what `../summary/reads.ts` holds a
// reply to, and what Core's settled sentence may offer
// (`../../value-readings/settled-rows.ts`). One reading, so the two cannot differ
// (lead decision, 2026-11-03, t841: the sentence offers only what the rule takes).
import { AutomationStudioRequestRowId } from "./id.ts";

/** The column a row said with its tested value names. */
const TESTED_COLUMN = /^.+? — ([\p{L}\p{N}_.$@-]{1,64}): /su;
/** A presence test's wording (`../../read-account/condition.ts`): its column, what its read found where said, and `is present` or `is absent`. */
const PRESENCE_WORDING = /^([\p{L}\p{N}_.$@-]{1,64})(?: \(read .*\))? (?:not )?is (?:present|absent)$/su;
/** A text test's wording when a column names what it tests (t624). */
const TEXT_WORDING = /^([\p{L}\p{N}_.$@-]{1,64})(?: \(read .*\))? (?:not )?(?:contains|startsWith|endsWith|matches|equals) \[?"/su;

/**
 * The column a settled condition's first row or wording names, where one can be
 * read and it is none of the answer's own columns (t790, which a reply lists
 * routinely); `undefined` otherwise, and only `condition N` names it.
 */
export function automationStudioRequestSettledColumn(firstRow: string, wording: string | undefined, answerColumns: ReadonlySet<string>): string | undefined {
  const column = TESTED_COLUMN.exec(AutomationStudioRequestRowId.unsaid(firstRow))?.[1]
    ?? PRESENCE_WORDING.exec(wording ?? "")?.[1]
    ?? TEXT_WORDING.exec(wording ?? "")?.[1];
  return column && !answerColumns.has(column) ? column : undefined;
}
