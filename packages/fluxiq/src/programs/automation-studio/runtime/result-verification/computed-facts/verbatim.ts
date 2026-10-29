// Each stored cell as the verbatim text of one element of the view it was read
// from, where Core holds that text.
//
// **No fact yet, and why (t795).** The check is that a stored cell is a
// verbatim substring of the one element it was read from, under a declared
// normalisation (framework plan P5; the traced judges' `$0.00` beside `$7.59`).
// It needs, for each stored cell, the text of that element. The summary holds
// none of it:
//
// - `endView` is the page the run or test ended on, not the list each cell was
//   read off: a read on an earlier page, or one the run moved on from, holds
//   cells the end view never shows, so a cell absent from it is no defect.
// - A build test's `observed` and `stores` name a read's rows by label alone
//   (`../build-test/read-rows.ts`, `../build-test/stores.ts`), never a cell.
// - `leftOutCells` and `leftOutTogether[].cells` are the cells of rows a
//   condition left out, which are not stored.
//
// So this computes no fact, and the judge is asked as before. It becomes
// computable when each stored cell carries a reference to the element it was
// read from and that element's text, which paired W5 is to supply.

import type { AutomationStudioResultComputedFact, AutomationStudioResultComputedFactsInput } from "../contracts/index.ts";

/** Each stored cell as the verbatim text of one element of the view it was read from, where Core holds that text. None where Core cannot compute it: today, always (header). */
export function automationStudioResultVerbatimFact(_input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  return [];
}
