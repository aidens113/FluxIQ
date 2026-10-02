// The columns an extraction declares when its author declared none: the ones
// the instruction names, matched to the fields the extraction reads.
//
// **Why the build declares them.** Live run 12 built a list extraction with six
// fields -- name, price, rating and url, which the instruction named, and
// `plus` and `ad`, which the model read only to filter by -- and no record
// output, so the domain stored every field it read and each row carried two
// columns nobody asked for. The domain already narrows a read and its store to
// a declared schema whose every id is one of the read's field keys (downstream
// `output-nodes/extract-list/declared-columns.ts`), and does nothing without
// one. So the build declares one, from the person's own words, and every
// extraction Flow stores exactly what was asked.
//
// **How a name meets a field.** Exactly first, then with case and separators
// ignored (`./keys.ts`), so "Product name" meets `product_name`. Each field is
// declared at most once, in the order the instruction named them, under the id
// the read already uses and with the person's own spelling as its label.
//
// **A name no field matches is not a refusal.** The columns that matched are
// declared, and the rest are handed back so the build can say so: information
// for the model and the judge, never a gate. When none matched, nothing is
// declared and the extraction keeps every column it reads, as before.
import { authoringFieldId, authoringKey } from "./keys.ts";

/** One declared column: the field key the read uses, and the name the instruction gave it. */
export type AuthoringInstructionRecordColumn = { id: string; label: string };

/** The instruction's named columns, matched to an extraction's field keys. */
export function authoringInstructionRecordColumns(input: {
  /** The columns the instruction names, as written (`../answerability/instruction-columns.ts`). */
  named: readonly string[];
  /** The field keys the extraction reads. */
  fieldKeys: readonly string[];
}): { columns: AuthoringInstructionRecordColumn[]; unmatched: string[] } {
  const usable = input.fieldKeys.filter((key) => authoringFieldId(key) === key);
  const taken = new Set<string>();
  const columns: AuthoringInstructionRecordColumn[] = [];
  const unmatched: string[] = [];
  for (const name of input.named) {
    const exact = usable.find((key) => key === name && !taken.has(key));
    const loose = exact ?? usable.find((key) => !taken.has(key) && authoringKey(key) !== "" && authoringKey(key) === authoringKey(name));
    if (loose === undefined) {
      unmatched.push(name);
      continue;
    }
    taken.add(loose);
    columns.push({ id: loose, label: name });
  }
  return { columns, unmatched };
}
