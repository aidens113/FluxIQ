/**
 * Where the rows hold each column a request names (t1074, `./map.ts`): the stored field that holds it and the evidence
 * that says so, in the request's order, and the named columns no evidence places.
 *
 * - `name`: a stored field is called so, by id or label (case, spaces, `_`, `-` and a plural `s` aside).
 * - `values`: the column's own name is a word in the field's values on most rows that show one (`9 bids`, `+£5.20
 *   postage`), and in no other field's as often.
 * - `order`: the declaration lists as many columns as the request names, in its order, and every column placed by
 *   name or values sits where the declaration lists its field, so the rest are the declaration's at their places.
 */
export type AutomationStudioRecordAskedColumns = {
  held: { asked: string; field: string; by: "name" | "values" | "order" }[];
  unheld: string[];
};
