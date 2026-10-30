// The steps a judge's finding or a trial's feedback names, as Core's record states them (P1a item 3).
//
// Read from the record's own `steps` list (entries that failed or that the judge flagged) and from a
// numeric `step` / `failedStep` / `readings[].step` it carries. Nothing is inferred: a record that
// names no step gives none, and the refusal omits the field.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function number(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

/** The steps the record names, by the number Core's feedback gives them, each once, in order, with its label where given. */
export function automationStudioCandidateFixPoint(...records: Array<JsonObject | undefined>): JsonObject[] | undefined {
  const found = new Map<number, JsonObject>();
  const add = (step: number | undefined, label: JsonValue | undefined): void => {
    if (step === undefined || found.has(step)) return;
    found.set(step, { step, ...(typeof label === "string" && label.trim() ? { label: label.replace(/\s+/gu, " ").trim().slice(0, 80) } : {}) });
  };
  for (const record of records) {
    if (!record) continue;
    for (const entry of Array.isArray(record.steps) ? record.steps : []) {
      if (isObject(entry) && (entry.status === "failed" || entry.flagged === true)) add(number(entry.step), entry.label);
    }
    add(number(record.step), undefined);
    add(number(record.failedStep), undefined);
    if (isObject(record.failedStep)) add(number(record.failedStep.step), undefined);
    for (const reading of Array.isArray(record.readings) ? record.readings : []) if (isObject(reading)) add(number(reading.step), reading.label);
  }
  return found.size ? [...found.values()].sort((a, b) => (a.step as number) - (b.step as number)) : undefined;
}
