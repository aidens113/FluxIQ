// What an unchanged rerun of a read is told when one of its conditions left out
// no row: that condition, by its number, and the values it read on the rows it
// kept (t693).
//
// Run `run-mvbr0w7e-6a01c05b`'s result repair spent 45% of the run resending
// one condition that every row met -- it asked only whether a value was there,
// and every row had one -- six decisions running. Each resend was refused as
// unchanged (`changes_nothing`) and told to inspect the previous result and, if
// its rows were right, go on to the act after the read. Its rows were not
// right, the result said so only as a count of zero beside the condition, and
// nothing said what the condition had read. So such a refusal now names the
// condition that kept every row, says that as written it narrows nothing, and
// quotes the few values it read on those rows, which is what it takes to write
// one that does.
//
// It reads the host's per-condition account on the draft step
// (`../../flow-draft/step.ts`, `conditions`): counts, and values already
// screened against the call's own evidence (`../../flow-draft/condition-account.ts`).
// Nothing here knows what kind of item, value or condition it is.

import type { AutomationStudioFlowDraftStepCondition } from "../../flow-draft/index.ts";

/**
 * What a refused unchanged rerun of the read at `step.position` is told when
 * at least one of its conditions held of every item it was asked about, or
 * nothing when none did, or the step carries no account.
 */
export function automationStudioLlmEvidenceNarrowedNothing(step: { position: number; conditions?: readonly AutomationStudioFlowDraftStepCondition[] | undefined }): string | undefined {
  const n = step.position;
  const idle = (step.conditions ?? []).flatMap((condition, index) => condition.rejected === 0 && condition.kept > 0 ? [{ number: index + 1, condition }] : []);
  if (!idle.length) return undefined;
  const one = idle.length === 1;
  const said = idle.map(({ number, condition }) => {
    const values = condition.keptValues.map((value) => JSON.stringify(value)).join(", ");
    const read = values ? `the values it read on them include ${values}` : "it read no value on any of them";
    return `Condition ${number} left out none of the ${condition.kept} row${condition.kept === 1 ? "" : "s"} it was asked about: it held of every one, and ${read}.`;
  });
  const which = one ? "that condition" : "those conditions";
  return `Step ${n}'s identical request was not sent again: on the same state it would answer exactly as before. Its conditions are counted in the order the step's argument lists them. ${said.join(" ")} `
    + `So as written ${which} narrow${one ? "s" : ""} nothing, and sending the same request again cannot change the rows. `
    + `Rerun step ${n} with ${which} changed to test what tells the rows the instruction asks for from the rest -- a value those rows have and the others lack, compared by its words or its number: {"step": ${n}, "change": "rerun", "input": {<only the keys that change>}}. `
    + `If every row step ${n} kept is one the instruction asks for, ${which} ${one ? "is" : "are"} not needed: leave step ${n} as it is and go on with what the Flow still lacks.`;
}
