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
// **Screened as the stored rows the judge is shown are** (`../result-summary.ts`):
// a label from a column the domain denies, or shaped like a credential, is said
// as withheld rather than left out, so the list still counts every row.

import type { JsonValue } from "../../../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** What a label that may not be said reads as. */
const WITHHELD_LABEL = "(withheld)";

/** The labels of the rows a condition removed by itself, screened, or `undefined` for none or anything that is not that list. */
export function automationStudioResultReadAloneRows(value: JsonValue | undefined, deniedKeys: readonly string[]): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const labels: string[] = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const [cell] = Object.entries(row);
    if (cell === undefined || typeof cell[1] !== "string") continue;
    const found = screenAutomationStudioLlmEvidence({ [cell[0]]: cell[1] }, deniedKeys);
    labels.push(found.deniedKey || found.secretShaped ? WITHHELD_LABEL : cell[1]);
  }
  return labels.length ? labels : undefined;
}
