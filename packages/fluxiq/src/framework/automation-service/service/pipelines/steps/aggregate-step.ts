import { canonicalJson, dataFieldPathSteps, type DataFieldPath, type DataStep } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { compareValues, readField } from "../expression/index.ts";
import type { PipelineRecord, PipelineRunContext } from "../types.ts";
import { deriveRecord } from "./derive-record.ts";

type Measure = Extract<DataStep, { kind: "aggregate" }>["measures"][number];

function nameOf(path: DataFieldPath): string {
  return dataFieldPathSteps(path).join(".");
}

function fold(measure: Measure, members: readonly PipelineRecord[]): JsonValue {
  if (measure.op === "count") return members.length;
  const field = measure.field as DataFieldPath;
  const values = members.map((member) => readField(member.data, field));
  const present = values.filter((value) => value !== null);
  const numbers = present.filter((value): value is number => typeof value === "number");
  switch (measure.op) {
    case "count_distinct": return new Set(present.map((value) => canonicalJson(value))).size;
    case "sum": return numbers.reduce((total, value) => total + value, 0);
    case "avg": return numbers.length === 0 ? null : numbers.reduce((total, value) => total + value, 0) / numbers.length;
    case "min": return present.length === 0 ? null : present.reduce((best, value) => (compareValues(value, best) < 0 ? value : best));
    case "max": return present.length === 0 ? null : present.reduce((best, value) => (compareValues(value, best) > 0 ? value : best));
    case "first": return values[0] ?? null;
    case "last": return values[values.length - 1] ?? null;
    case "collect": return present;
  }
}

function put(data: JsonObject, key: string, value: JsonValue): void {
  Object.defineProperty(data, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * One record per `groupBy` group (one record in all when it is empty, even for no
 * input), the group field values under their dotted names and each measure under its
 * name. `sum` and `avg` fold the numbers among the values; null values are left out of
 * `count_distinct`, `min`, `max` and `collect`.
 */
export function aggregateStep(step: Extract<DataStep, { kind: "aggregate" }>, records: readonly PipelineRecord[], context: PipelineRunContext): PipelineRecord[] {
  const groups = new Map<string, Array<{ record: PipelineRecord; index: number }>>();
  records.forEach((record, index) => {
    const key = canonicalJson(step.groupBy.map((path) => readField(record.data, path)));
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [{ record, index }]);
    else group.push({ record, index });
  });
  if (groups.size === 0 && step.groupBy.length === 0) groups.set("[]", []);
  const out: PipelineRecord[] = [];
  for (const group of groups.values()) {
    const members = group.map((member) => member.record);
    const data: JsonObject = {};
    const first = members[0];
    for (const path of step.groupBy) put(data, nameOf(path), first === undefined ? null : readField(first.data, path));
    for (const measure of step.measures) put(data, measure.name, fold(measure, members));
    out.push(deriveRecord(context, step.id, data, group.map((member) => `/${member.index}`), []));
  }
  return out;
}
