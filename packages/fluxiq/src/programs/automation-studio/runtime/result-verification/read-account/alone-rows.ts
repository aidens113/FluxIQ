// The rows one `where` condition removed by itself, as the judge is shown them.
//
// A count cannot say whether a condition is right. Live run 15
// (`run-muqj2bgb-d048ec37`) held 10 of 13 earbuds: `name not contains ["ear
// tips", "charging case", ...]` removed by itself three earbuds sold "with
// Wireless Charging Case", the judge was told "rejected 20, 5 of them by itself"
// and nothing else, and it passed the result (user: no hidden information). So
// each condition's account names those rows -- rows every other condition kept,
// which are few by nature -- each by its label, the first text column of the row
// (`service/summaries/extraction-summary.ts` keeps it as `{ column: label }`).
// Every row, every label whole. A row that also failed another condition is not
// among them: it would be gone without this condition.
//
// **And the value the condition tested** (t195-w34). A label alone cannot say
// why a row was left out. Live run `run-murwcaj0-40e56557` (cause R6): a regex
// meant to keep five or more mutual friends dropped Jonas Weber, whose row says
// "Aisha Khan and 4 other mutual friends", and the build-test judge, shown only
// the names, called the rows left out "exactly the requests with fewer than five
// mutual friends". So a row may carry a second cell after its label, the column
// the condition tested and that row's value in it, and is said as
// `Jonas Weber — mutualFriends: Aisha Khan and 4 other mutual friends`; an
// empty value as `(no value)`. One shape from both senders: the domain's replay
// writes `{ name: label, mutualFriends: value }` (`build-test/read-rows.ts`),
// and a playback's stored row is cut to the same two cells by `accounts.ts`. A
// row of one cell -- every row a sender that predates this sends, and a row
// whose condition tested its label's own column -- is its label alone.
//
// **Screened as the stored rows the judge is shown are** (`../result-summary.ts`):
// a label from a column the domain denies, or shaped like a credential, is said
// as withheld rather than left out, so the list still counts every row. A tested
// value is screened the same way and on its own: withheld, it reads
// `label — column: (withheld)`, or `label — (withheld)` where the column's own
// name may not be said, and the label beside it stays.

import type { JsonValue } from "../../../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** What a label or a tested value that may not be said reads as. */
const WITHHELD_LABEL = "(withheld)";
/** What an empty tested value reads as. */
const NO_VALUE = "(no value)";

/**
 * The rows a condition removed by itself, each its label and, where the row
 * carries it, the value the condition tested, screened; `undefined` for none or
 * anything that is not that list. `onWithheld` is called when the screen
 * withheld anything, so a caller can say so.
 */
export function automationStudioResultReadAloneRows(value: JsonValue | undefined, deniedKeys: readonly string[], onWithheld?: () => void): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const labels: string[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const [cell, tested] = Object.entries(row);
    if (cell === undefined || typeof cell[1] !== "string") continue;
    const found = screenAutomationStudioLlmEvidence({ [cell[0]]: cell[1] }, deniedKeys);
    const label = found.deniedKey || found.secretShaped ? WITHHELD_LABEL : cell[1];
    if (label !== cell[1]) onWithheld?.();
    labels.push(tested !== undefined && typeof tested[1] === "string" ? `${label} — ${testedText(tested[0], tested[1], deniedKeys, onWithheld)}` : label);
  }
  return labels.length ? labels : undefined;
}

/** `column: value`, screened: the value whole, `(no value)` for empty, withheld where it or its column may not be said. */
function testedText(column: string, value: string, deniedKeys: readonly string[], onWithheld: (() => void) | undefined): string {
  if (screenAutomationStudioLlmEvidence({ [column]: "" }, deniedKeys).deniedKey || screenAutomationStudioLlmEvidence(column, []).secretShaped) {
    onWithheld?.();
    return WITHHELD_LABEL;
  }
  const text = value.trim();
  if (!text) return `${column}: ${NO_VALUE}`;
  if (screenAutomationStudioLlmEvidence(text, []).secretShaped) {
    onWithheld?.();
    return `${column}: ${WITHHELD_LABEL}`;
  }
  return `${column}: ${text}`;
}
