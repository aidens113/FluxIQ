import { cellOf } from "../cell-text.ts";
import { automationStudioRecordConditionHolds } from "../condition/index.ts";
import { automationStudioRecordFieldComparisonFields, automationStudioRecordFieldComparisonHolds } from "../field-comparison.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordProcessing } from "../types.ts";
import type { AutomationStudioRecordProcessingMissingEvidence } from "./missing-evidence.ts";
import { automationStudioRecordFieldComparisonReading } from "./comparison.ts";
import { automationStudioRecordConditionReading } from "./condition.ts";

type Missing = Omit<AutomationStudioRecordProcessingMissingEvidence, "source">;
type Reading = { holds: boolean; missing: Missing[] };
/** `notShown` says whether the row's own read captured a field the row states no value for (`../not-shown.ts`). */
type Check = (values: Readonly<Record<string, unknown>>, notShown: (field: string) => boolean) => Reading;

/**
 * Existing predicates with explicit unknown readings, in the evaluator's existing filter order. A cell the
 * item does not show is read as saved processing reads an absent value (t993): a definite verdict, never missing evidence.
 */
export function automationStudioRecordProcessingFilterChecks(process: AutomationStudioRecordProcessing, now: number, automatic: boolean): Check[] {
  const from = (field: string): { from?: string } => {
    const derived = process.derive?.find((entry) => entry.id === field);
    return derived ? { from: derived.from } : {};
  };
  const condition = (entry: AutomationStudioRecordCondition, values: Readonly<Record<string, unknown>>, notShown: (field: string) => boolean, reference: Omit<Missing, "field" | "reason">): Reading => {
    const cell = cellOf(values, entry.field);
    const reading: { holds: boolean; reason?: "missing" | "unreadable" } = automatic && !notShown(entry.field) ? automationStudioRecordConditionReading(entry, cell, now) : { holds: automationStudioRecordConditionHolds(entry, cell, now) };
    return { holds: reading.holds, missing: reading.reason ? [{ ...reference, field: entry.field, ...from(entry.field), reason: reading.reason }] : [] };
  };
  return [
    ...(process.where ?? []).map((entry, index): Check => (values, notShown) => condition(entry, values, notShown, { operator: "where", index })),
    // `anyOf` is one filter, its groups alternatives (`../any-of.ts`, t1074). A group holds when each of its conditions
    // does and is settled false by one condition known false; a row is decided by the groups that have evidence for it:
    // kept when any group holds, left out when every group is known false, and only otherwise unknown, then naming the
    // values of the groups still undecided. A value one group cannot read never withholds a row another group keeps.
    ...(process.anyOf?.length ? [((values, notShown) => {
      const groups = process.anyOf!.map((group, index): Reading => {
        const readings = group.map((entry, at) => condition(entry, values, notShown, { operator: "anyOf", index, condition: at }));
        if (readings.every((reading) => reading.holds)) return { holds: true, missing: [] };
        if (readings.some((reading) => !reading.holds && reading.missing.length === 0)) return { holds: false, missing: [] };
        return { holds: false, missing: readings.flatMap((reading) => reading.missing) };
      });
      if (groups.some((group) => group.holds)) return { holds: true, missing: [] };
      return { holds: false, missing: groups.flatMap((group) => group.missing) };
    }) as Check] : []),
    ...(process.compare ?? []).map((entry, index): Check => (values, notShown) => {
      // A side the item does not show fails the comparison whatever `not` says, as saved processing reads it.
      const settled = !automatic || automationStudioRecordFieldComparisonFields(entry).some(notShown);
      const reading = settled ? { holds: automationStudioRecordFieldComparisonHolds(entry, values, now), missing: [] } : automationStudioRecordFieldComparisonReading(entry, values, now);
      return { holds: reading.holds, missing: reading.missing.map((issue) => ({ operator: "compare", index, ...issue, ...from(issue.field) })) };
    })
  ];
}
