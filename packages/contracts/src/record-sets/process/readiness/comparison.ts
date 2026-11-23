import { cellOf } from "../cell-text.ts";
import { automationStudioRecordFieldComparisonHolds } from "../field-comparison.ts";
import { AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS } from "../processing-vocabulary.ts";
import type { AutomationStudioRecordFieldComparison } from "../types.ts";
import { automationStudioRecordRequiredValueIssue } from "./value.ts";

type Missing = { field: string; reason: "missing" | "unreadable" };

/** The existing field comparisons with conjunction/negation preserved when a side is unavailable. */
export function automationStudioRecordFieldComparisonReading(comparison: AutomationStudioRecordFieldComparison, values: Readonly<Record<string, unknown>>, now: number): { holds: boolean; missing: Missing[] } {
  const readings = AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS.flatMap((key) => {
    const right = comparison[key];
    if (right === undefined) return [];
    const missing = [comparison.field, right].flatMap((field): Missing[] => {
      const reason = automationStudioRecordRequiredValueIssue(cellOf(values, field), comparison.as ?? "number", now);
      return reason ? [{ field, reason }] : [];
    });
    const single = { field: comparison.field, [key]: right, ...(comparison.as ? { as: comparison.as } : {}) };
    return [{ holds: missing.length === 0 && automationStudioRecordFieldComparisonHolds(single, values, now), missing }];
  });
  if (readings.some((reading) => !reading.holds && reading.missing.length === 0)) return { holds: comparison.not === true, missing: [] };
  const missing = [...new Map(readings.flatMap((reading) => reading.missing).map((issue) => [issue.field, issue])).values()];
  return { holds: missing.length === 0 && comparison.not !== true, missing };
}
