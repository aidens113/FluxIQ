// What every answer shows of its result, whichever way the attempt ended: the check, the
// rows, the model's words (told as its own), what it did on the site from the act record,
// what was checked and what is missing.

import type { ChatTaskResult } from "../../ports/index.ts";
import type { AnswerModel } from "./answer-types.ts";
import { checkWords } from "./check-words.ts";
import { effectiveLabel } from "./effective-label.ts";
import { rowsModel } from "./rows-model.ts";
import { siteWords, skippedWords } from "../words/index.ts";

type ResultParts = Pick<AnswerModel, "check" | "rows" | "text" | "siteTitle" | "siteLines" | "checked" | "missing" | "skipped" | "canExport">;

/** The count line an older check wrote for every verdict ("5 rows, 3 acts on the site, once against what was asked for."): it says what was looked at, which is no account of what failed. */
const COUNTS_ONLY = /, once against what was asked for\.$|^nothing to show, once against what was asked for\.$/u;

/**
 * What the check said, under the label its verdict gives it: what was checked on a yes, what failed on a no and what it
 * was meant to settle on an unsure. A check that was never made, or whose words are only the count of what it looked at, says nothing here.
 */
function checkedLine(result: ChatTaskResult): string | undefined {
  if (result.checkedWhat === undefined) return undefined;
  const label = effectiveLabel(result);
  if (label === "confirmed") return `Checked: ${result.checkedWhat}`;
  if (COUNTS_ONLY.test(result.checkedWhat)) return undefined;
  return label === "refuted" ? `What failed: ${result.checkedWhat}` : `Meant to check: ${result.checkedWhat}`;
}

/** The parts of a result that holds something to show. */
export function resultParts(result: ChatTaskResult): ResultParts {
  const site = siteWords(result.acts);
  const parts: ResultParts = { check: checkWords(result), siteTitle: site.title, siteLines: site.lines, canExport: result.rows !== undefined && result.rows.totalRows > 0 };
  if (result.rows !== undefined) parts.rows = rowsModel(result.rows);
  if (result.answerText !== undefined) parts.text = { label: "In the model's words", text: result.answerText.text };
  const checked = checkedLine(result);
  if (checked !== undefined) parts.checked = checked;
  if (result.missingWhat !== undefined) parts.missing = `Missing: ${result.missingWhat}`;
  const skipped = skippedWords(result.skippedAsDone);
  if (skipped !== undefined) parts.skipped = skipped;
  return parts;
}

/** What shows of a result that holds nothing: what is missing, and any rows skipped. */
export function emptyParts(result: ChatTaskResult | undefined): ResultParts {
  const parts: ResultParts = { siteLines: [], canExport: false };
  if (result?.missingWhat !== undefined) parts.missing = `Missing: ${result.missingWhat}`;
  const skipped = skippedWords(result?.skippedAsDone);
  if (skipped !== undefined) parts.skipped = skipped;
  return parts;
}
