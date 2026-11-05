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

function checkedLine(result: ChatTaskResult): string | undefined {
  if (result.checkedWhat === undefined) return undefined;
  if (effectiveLabel(result) === "refuted") return `What failed: ${result.checkedWhat}`;
  return effectiveLabel(result) === "unverified" ? `Meant to check: ${result.checkedWhat}` : `Checked: ${result.checkedWhat}`;
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
