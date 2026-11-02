/**
 * One step that acted on the page before a read (`AutomationStudioResultReadAccount.narrowedBefore`).
 * `control` is the words of what it pressed or chose, as a model may read them
 * (`../llm/model-facing/control-words.ts`), absent where it names no control
 * or no denied-keys declaration was made. `effect`: `new_page`, it went to
 * another page; `same_page`, it changed the page it stayed on;
 * `already_shown`, its try found the page already showing what it does; absent
 * where the run recorded no comparison of the page before and after it.
 */

export type ResultNarrowingStep = {
  nodeId: string;
  label?: string;
  control?: string;
  effect?: "new_page" | "same_page" | "already_shown";
  /**
   * Where the step chose one option of a named group the page showed (t655,
   * `../narrowing-group.ts`): the group's words, the option it chose
   * (`chose`), and every other option of the group that stayed unchosen
   * (`leftOptions`), each with the count the page showed beside it before the
   * step. Words and numbers the domain read off the page (`groups` on its
   * snapshot summary), screened as `control` is; Core interprets none of them.
   * Absent where the step chose no such option, or the page said none.
   */
  group?: string;
  chose?: string;
  leftOptions?: Array<{ words: string; count?: number }>;
  /** The number of results the page stated before and after the step (its snapshot's `resultCount`), where it stated one. */
  resultCount?: { before?: number; after?: number };
  /**
   * True where the step only added a choice (t659, `../narrowing-group.ts`):
   * exactly one option became chosen, found by its flip, in a group that showed
   * no option chosen before the step. Then a `resultCount` the same before and
   * after means the same rows, and the step removed none
   * (`../refuted-no/unseen-row-claim.ts`). Absent otherwise -- a switch between
   * options, a sort, or a step Core cannot say it of.
   */
  addedChoice?: boolean;
};
