// Places each column a request names on the stored field that holds it (t1074).
//
// **Why.** A list read that names no fields keeps the site's items under the read's own keys (`link_text`, `text_5`,
// `text_9`), and a request names its columns in its own words ("title, price, bids and postage"). Run
// `run-mwyn25dg-3ba0b41c` kept 46 rows under such keys; the model's notes said which key held which column, and still
// the answer was refused as not the asked table (0087) until it read the list again naming them, then declared its
// processing again over the new names (0089-0106). Run `run-mwyfx9fs-06a170bf` spent 13 calls the same way. Extraction
// keeps every column and the asked columns are a view over the rows (AGENTS.md, 2026-11-20), so the framework places
// them itself, from evidence it already holds, and the answer shows each under the request's name.
//
// **Evidence, in this order, each field placed once.**
// 1. **By name**: a stored field called so, by id or label, with case, spaces, `_`, `-` and a plural `s` aside.
// 2. **By values**: the column's own name read as words in the field's values (`9 bids`, `1 bid`, `+£5.20 postage`)
//    on at least half the rows that show the field, and on more of them than in any other field's; fields whose values
//    are the same on every row count as one. A tie between fields with different values places nothing.
// 3. **By order**: the declaration's own `columns`, where it lists as many as the request names and every column
//    placed by name or values sits at its own place there: the rest are then the declaration's at their places. That is
//    the model's word, accepted only where the framework's evidence agrees with all of it.
// A column none of these places stays unheld, and is said so: the framework never guesses one. Nothing here is a word
// of any site or task: the request's own names and the rows' own values are the only words compared.
//
// The page view's lines are not read: a read keeps every item's words in its fields, and a label the page draws beside
// a value (`Postage: £5.20`) is in that field's values, which step 2 reads.
import type { AutomationStudioRecordSchema } from "../schema.ts";
import type { AutomationStudioRecordAskedColumns } from "./types.ts";
import { automationStudioRecordAskedWords, automationStudioRecordAskedWordsHold } from "./words.ts";

/** Least share of the rows showing a field whose values hold the column's name, for step 2 (header). */
const VALUES_SHARE = 0.5;

export function automationStudioRecordAskedColumns(input: {
  asked: readonly string[];
  schema: AutomationStudioRecordSchema;
  rows: readonly Readonly<Record<string, unknown>>[];
  /** The declaration's own `columns`, bound to stored ids, where it names them (step 3). */
  columns?: readonly string[] | undefined;
}): AutomationStudioRecordAskedColumns {
  const stored = input.schema.fields.filter((field) => field.handling !== "exclude");
  const placed = new Map<string, { field: string; by: "name" | "values" | "order" }>();
  const taken = new Set<string>();
  const place = (asked: string, field: string, by: "name" | "values" | "order"): void => {
    placed.set(asked, { field, by });
    taken.add(field);
  };
  const named = (name: string): string => automationStudioRecordAskedWords(name).join(" ");
  // 1. By name: an id first, then a label.
  for (const asked of input.asked) {
    const key = named(asked);
    if (!key) continue;
    const byId = stored.filter((field) => !taken.has(field.id) && named(field.id) === key);
    const byLabel = byId.length ? byId : stored.filter((field) => !taken.has(field.id) && named(field.label) === key);
    if (byLabel.length === 1) place(asked, byLabel[0]!.id, "name");
  }
  // 2. By values: the name's words in the field's values.
  const textOf = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined);
  const signature = (field: string): string => JSON.stringify(input.rows.map((row) => textOf(row[field]) ?? null));
  for (const asked of input.asked) {
    if (placed.has(asked)) continue;
    const phrase = automationStudioRecordAskedWords(asked);
    if (!phrase.length) continue;
    const scored = stored.flatMap((field) => {
      if (taken.has(field.id)) return [];
      const shown = input.rows.flatMap((row) => {
        const text = textOf(row[field.id]);
        return text === undefined ? [] : [text];
      });
      const holding = shown.filter((text) => automationStudioRecordAskedWordsHold(automationStudioRecordAskedWords(text), phrase)).length;
      return shown.length && holding / shown.length >= VALUES_SHARE ? [{ field: field.id, holding }] : [];
    });
    const best = Math.max(0, ...scored.map((entry) => entry.holding));
    const top = scored.filter((entry) => entry.holding === best);
    if (top.length && new Set(top.map((entry) => signature(entry.field))).size === 1) place(asked, top[0]!.field, "values");
  }
  // 3. By order: the declaration's own columns, where the evidence agrees with all of it.
  const columns = input.columns;
  if (columns && columns.length === input.asked.length && placed.size < input.asked.length
    && input.asked.every((asked, at) => !placed.has(asked) || placed.get(asked)!.field === columns[at])) {
    input.asked.forEach((asked, at) => {
      const field = columns[at]!;
      if (!placed.has(asked) && !taken.has(field) && stored.some((entry) => entry.id === field)) place(asked, field, "order");
    });
  }
  return {
    held: input.asked.flatMap((asked) => (placed.has(asked) ? [{ asked, ...placed.get(asked)! }] : [])),
    unheld: input.asked.filter((asked) => !placed.has(asked))
  };
}
