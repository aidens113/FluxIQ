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
import type { JsonValue } from "../../../../core/index.ts";
import { isJsonObject } from "../authoring/values.ts";

/**
 * The field ids the written `process` sorts by or tests, each once, in the order they are named: its sort's and
 * `where`'s, then (t970) its `anyOf` groups', both sides of each `compare`, and the column each `derive` reads.
 * A column `derive` makes is not a field and is never listed.
 */
export function authoringProcessFieldIds(process: JsonValue | undefined): string[] {
  if (!isJsonObject(process)) return [];
  const found: string[] = [];
  const add = (id: JsonValue | undefined): void => {
    if (typeof id === "string" && !found.includes(id)) found.push(id);
  };
  for (const list of [process.sort, process.where]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) if (isJsonObject(item)) add(item.field);
  }
  if (Array.isArray(process.anyOf)) for (const group of process.anyOf) if (Array.isArray(group)) for (const item of group) if (isJsonObject(item)) add(item.field);
  if (Array.isArray(process.compare)) {
    for (const item of process.compare) if (isJsonObject(item)) for (const key of ["field", "atLeast", "atMost", "lessThan", "greaterThan", "equals"]) add(item[key]);
  }
  if (Array.isArray(process.derive)) for (const item of process.derive) if (isJsonObject(item)) add(item.from);
  const derived = new Set(Array.isArray(process.derive) ? process.derive.flatMap((item) => (isJsonObject(item) && typeof item.id === "string" ? [item.id] : [])) : []);
  return found.filter((id) => !derived.has(id));
}
