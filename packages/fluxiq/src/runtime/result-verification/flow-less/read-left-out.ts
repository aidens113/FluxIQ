// What one read's own conditions left out, as the read's answer said it: the rows the read saw and did
// not keep, under the conditions that left them out (`./types.ts`, `readPages`).
//
// Live run `run-mwaknxf9-7549d126`: the site listed some products twice, once as an ad and once not. The
// reads kept every non-ad card and left the ads out, and the judge, shown the stored rows by name and the
// end view's cards, took the ad card of a stored row's name for the row (judges 0043, 0060: "kept a
// sponsored listing"). The model then added a condition leaving that name out by itself, dropping the
// non-ad card the person asked for, and judge 0114 passed the shorter list as the ad correctly left
// out. What each read left out, and by which condition, is what tells two cards of one name apart.
// Core's readers fill it (`SVC/answer-first/rows/read-evidence.ts`) and the judge's copy says it
// (`./read-pages-shown.ts`).

import type { JsonObject, JsonValue } from "../../../core/index.ts";

export type AutomationStudioFlowLessReadLeftOut = {
  /** The read's conditions as its call wrote them, in order, and its columns: what each condition is worded from. */
  where?: readonly JsonValue[];
  columns?: JsonObject;
  /** What each condition read on the items it left out, aligned with `where`, where the read said. */
  found?: readonly (readonly string[] | undefined)[];
  /**
   * The rows left out, in sets: under the 0-based places of the conditions that left them out. `alone`: that one
   * condition by itself, every other kept them; `together`: those conditions, each of which left them out; `unsplit`:
   * that condition, alone or with others, from a read that did not say which. Each row is its label first and, where
   * the read said it, the value the condition tested after it.
   */
  sets: readonly { kind: "alone" | "together" | "unsplit"; conditions: readonly number[]; rows: readonly JsonObject[] }[];
};
