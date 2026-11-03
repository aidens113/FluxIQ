// A saved answer's processing cells were measured before filtering. Reuse
// native-read settlement only for screened, aligned evaluator evidence of the
// same authored condition. No model-written flag or prose settles a cell.
import {
  automationStudioRecordConditionText,
  parseAutomationStudioRecordCondition,
  type AutomationStudioRecordCondition
} from "@fluxiq/contracts/automation";
import type { AutomationStudioResultProcessingCondition } from "../processing-account.ts";
import { automationStudioResultSettledRows } from "./settled-rows.ts";

/** Supported excluded cells, as Core's existing settled-value semantics reads them. */
export function automationStudioResultProcessingReadings(entry: AutomationStudioResultProcessingCondition, authored: AutomationStudioRecordCondition, number: number, answerColumns: ReadonlySet<string>) {
  const evaluated = entry.evaluation && parseAutomationStudioRecordCondition(entry.evaluation.condition);
  const rows = entry.leftOutOnlyByThis;
  const observations = entry.leftOutObservations;
  if (!evaluated || !rows?.length || observations?.length !== rows.length || !Number.isFinite(entry.evaluation?.now)
    || entry.number !== number || evaluated.field !== authored.field || authored.within !== undefined
    || entry.condition !== automationStudioRecordConditionText(evaluated)
    || automationStudioRecordConditionText(authored) !== automationStudioRecordConditionText(evaluated)) return undefined;
  const leftOut = rows.flatMap((row, index) => {
    const witness = observations[index];
    if (row === "(withheld)" || row === "[withheld]" || (witness?.state !== "present" && witness?.state !== "absent")) return [];
    if (witness.state === "present" && ["[withheld]", "(withheld)", "(no value)"].includes(witness.value)) return [];
    return [{
      row,
      witness,
      cell: witness?.state === "present" ? { label: row, value: witness.value } : undefined
    }];
  });
  // A screened/ambiguous row never becomes a negative reading, even when its
  // placeholder text would happen to fail a numeric bound.
  return automationStudioResultSettledRows({ condition: evaluated, column: evaluated.field, number, wording: entry.condition, leftOut, now: entry.evaluation!.now, answerColumns });
}
