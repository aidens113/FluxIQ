import { automationStudioRecordConditionComparesDates } from "../compares-dates.ts";
import { automationStudioRecordConditionHolds } from "../condition/index.ts";
import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS } from "../processing-vocabulary.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordConditionValue } from "../types.ts";
import { automationStudioRecordRequiredValueIssue } from "./value.ts";

type Reading = { holds: boolean; reason?: "missing" | "unreadable" };

/** Reads the existing condition's conjunction/equals alternatives without turning unknown into negative evidence. */
export function automationStudioRecordConditionReading(condition: AutomationStudioRecordCondition, cell: unknown, now: number): Reading {
  const dated = automationStudioRecordConditionComparesDates(condition);
  // Date predicates never retain an unreadable date through negation or another false conjunct.
  const dateIssue = dated ? automationStudioRecordRequiredValueIssue(cell, "date", now) : undefined;
  if (dateIssue) return { holds: false, reason: dateIssue };
  const read = (single: AutomationStudioRecordCondition, kind: "text" | "number" | "date"): Reading => {
    const reason = automationStudioRecordRequiredValueIssue(cell, kind, now);
    return reason ? { holds: false, reason } : { holds: automationStudioRecordConditionHolds(single, cell, now) };
  };
  const readings = [
    ...(condition.is === undefined ? [] : [{ holds: automationStudioRecordConditionHolds({ field: condition.field, is: condition.is }, cell, now) }]),
    ...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS.flatMap((key): Reading[] => condition[key] === undefined ? [] : [read({ field: condition.field, [key]: condition[key], ...(dated ? { as: "date" as const } : {}) }, dated ? "date" : "number")]),
    ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS.flatMap((key): Reading[] => condition[key] === undefined ? [] : [read({ field: condition.field, [key]: condition[key] }, "text")]),
    ...(condition.within === undefined ? [] : [read({ field: condition.field, within: condition.within }, "date")])
  ];
  if (condition.equals !== undefined) {
    const entries: AutomationStudioRecordConditionValue[] = Array.isArray(condition.equals) ? condition.equals : [condition.equals];
    const equal = entries.map((entry) => read({ field: condition.field, equals: entry }, typeof entry === "number" ? "number" : "text"));
    readings.push(equal.some((reading) => reading.holds) ? { holds: true } : equal.find((reading) => reading.reason !== undefined) ?? { holds: false });
  }
  if (!readings.length) return { holds: automationStudioRecordConditionHolds(condition, cell, now) };
  // A known false comparison settles the conjunction even when another reading is unknown.
  if (readings.some((reading) => !reading.holds && reading.reason === undefined)) return { holds: condition.not === true };
  const unknown = readings.find((reading) => reading.reason !== undefined);
  return unknown ?? { holds: condition.not !== true };
}
