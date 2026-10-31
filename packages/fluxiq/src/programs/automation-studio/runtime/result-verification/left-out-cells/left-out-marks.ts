// The marks the client read on the rows a read left out, as the judge is shown
// them beside their labels (t810, framework plan P5b).
//
// **Why.** A judge that calls a left-out row "asked for" has the row's cells to
// be held to, and a cell does not say what the item offers. A feed's suggested
// post carries a `Join group` button inside the post: the person is not in that
// group, so the post is outside what a read of "posts from my groups" asks. The
// client reads that control on the item and the summary carries it as an
// `outside` mark (`service/summaries/rejected-marks/`); these are those marks,
// aligned with the rows the account names, so a claim that the row was asked is
// refuted by the page's own words.
//
// **Screened as the cells are** (`./left-out-cells.ts`): a `said` or an `entity`
// shaped like a credential or a locator, or denied by the domain's keys, is said
// as withheld, so the mark still counts. A malformed entry is no mark; a row
// with none is `null`. Nothing here knows any client's words.

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioLocatorShapedText, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import type { AutomationStudioResultItemMark } from "../read-condition.ts";

/** What a mark text that may not be said reads as: the stored rows' own marker. */
const WITHHELD_VALUE = "(withheld)";

/**
 * Each row's marks, screened (header), in the rows' order; `undefined` where
 * the marks are not a list of `count` entries or no row has a readable mark, so
 * the marks could not be aligned with the labels said for the rows.
 */
export function automationStudioResultReadLeftOutMarks(marks: JsonValue | undefined, count: number, deniedKeys: readonly string[]): Array<AutomationStudioResultItemMark[] | null> | undefined {
  if (!Array.isArray(marks) || marks.length === 0 || marks.length !== count) return undefined;
  const said = (text: string): string => (screenAutomationStudioLlmEvidence(text, deniedKeys).secretShaped || automationStudioLocatorShapedText(text) ? WITHHELD_VALUE : text.trim());
  const rows = marks.map((entry): AutomationStudioResultItemMark[] | null => {
    if (!Array.isArray(entry)) return null;
    const own = entry.flatMap((mark): AutomationStudioResultItemMark[] => {
      if (typeof mark !== "object" || mark === null || Array.isArray(mark) || mark.kind !== "outside" || typeof mark.said !== "string" || !mark.said.trim()) return [];
      const entity = typeof mark.entity === "string" && mark.entity.trim() ? said(mark.entity) : undefined;
      return [{ kind: "outside", said: said(mark.said), ...(entity === undefined ? {} : { entity }) }];
    });
    return own.length ? own : null;
  });
  return rows.some((row) => row !== null) ? rows : undefined;
}
