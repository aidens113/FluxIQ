import { cellOf } from "../cell-text.ts";
import { automationStudioRecordConditionHolds } from "../condition/index.ts";
import { automationStudioRecordFieldComparisonHolds } from "../field-comparison.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordProcessing } from "../types.ts";
import type { AutomationStudioRecordProcessingMissingEvidence } from "./missing-evidence.ts";
import { automationStudioRecordFieldComparisonReading } from "./comparison.ts";
import { automationStudioRecordConditionReading } from "./condition.ts";

type Missing = Omit<AutomationStudioRecordProcessingMissingEvidence, "source">;
type Reading = { holds: boolean; missing: Missing[] };
type Check = (values: Readonly<Record<string, unknown>>) => Reading;

/** Existing predicates with explicit unknown readings, in the evaluator's existing filter order. */
export function automationStudioRecordProcessingFilterChecks(process: AutomationStudioRecordProcessing, now: number, automatic: boolean): Check[] {
  const from = (field: string): { from?: string } => {
    const derived = process.derive?.find((entry) => entry.id === field);
    return derived ? { from: derived.from } : {};
  };
  const condition = (entry: AutomationStudioRecordCondition, values: Readonly<Record<string, unknown>>, reference: Omit<Missing, "field" | "reason">): Reading => {
    const cell = cellOf(values, entry.field);
    const reading: { holds: boolean; reason?: "missing" | "unreadable" } = automatic ? automationStudioRecordConditionReading(entry, cell, now) : { holds: automationStudioRecordConditionHolds(entry, cell, now) };
    return { holds: reading.holds, missing: reading.reason ? [{ ...reference, field: entry.field, ...from(entry.field), reason: reading.reason }] : [] };
  };
  return [
    ...(process.where ?? []).map((entry, index): Check => (values) => condition(entry, values, { operator: "where", index })),
    ...(process.anyOf ?? []).map((group, index): Check => (values) => {
      const readings = group.map((entry, at) => condition(entry, values, { operator: "anyOf", index, condition: at }));
      if (readings.some((reading) => reading.holds)) return { holds: true, missing: [] };
      return { holds: false, missing: readings.flatMap((reading) => reading.missing) };
    }),
    ...(process.compare ?? []).map((entry, index): Check => (values) => {
      const reading = automatic ? automationStudioRecordFieldComparisonReading(entry, values, now) : { holds: automationStudioRecordFieldComparisonHolds(entry, values, now), missing: [] };
      return { holds: reading.holds, missing: reading.missing.map((issue) => ({ operator: "compare", index, ...issue, ...from(issue.field) })) };
    })
  ];
}
