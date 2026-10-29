// The stored fields a record output's own processing depends on (CC3).
//
// A `sort` or `where` reads stored values, and a field the schema leaves out is
// never stored (the run dataset keeps only schema fields), so a declared
// schema narrowed to the columns an answer shows would leave the processing,
// and Core's check of the answer's order or bounds, with nothing to read.
// The rule is domain-neutral: every field the written processing names is kept
// when the schema was declared here rather than written, whatever the field is
// and whatever the request said. `process.columns` still decides what the
// answer shows; storing is separate from showing.
import type { JsonValue } from "../../../../../core/index.ts";
import { isJsonObject } from "../authoring/values.ts";

/** The field ids the written `process` sorts by or tests, each once, in the order they are named. */
export function authoringProcessFieldIds(process: JsonValue | undefined): string[] {
  if (!isJsonObject(process)) return [];
  const found: string[] = [];
  for (const list of [process.sort, process.where]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isJsonObject(item) && typeof item.field === "string" && !found.includes(item.field)) found.push(item.field);
    }
  }
  return found;
}
