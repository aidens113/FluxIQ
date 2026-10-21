// The words a trial step's control is named by, to the model and the judge
// (t748): `feedback.steps[n].control` (`./feedback.ts`) and a lasting act's
// `on "<control>"` (`./landed-acts.ts`), one owner so both say the same.
//
// A control is named by its own words as the domain resolved them at submission
// (`automationStudioModelFacingControlWords`). That holds for a control a step
// acts on, whose words are who it is. It does not hold for a target whose words
// are the value the step reads: the domain marks such an identity `readsWords`
// (the downstream t743 mark on the resolved `element`), because those words
// were captured before an earlier step may have changed them. t743's office
// spec read an address line after its own Flow chose another address, and the
// feedback labelled the read `control: "<the old address>"` though the step had
// read the new one: a model reading it would take the old words for what was
// read.
//
// Such a step is named by the words it read in this trial: the one value it
// handed on (`outputs.value`, Core's port for a node's single value, where a
// read's answer lands by its `resultPath`), whitespace collapsed, held to the
// same screen as any control's own words (`control-text.ts`), and no longer than a short
// line. Where it read no such words -- it failed, it checks text rather than
// handing a value on, or what it read is withheld, too long or unsayable -- it
// is named by nothing, never by the words saved before.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, type AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioModelFacingControlText, automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";

/** The longest read value said as a step's control: past it, the words are no short name for the step (header). */
const MAX_READ_WORDS = 160;

/** The words the step's control is named by in this trial, or nothing (header); `attempt` absent names a read step by nothing. */
export function automationStudioTrialStepControl(node: AutomationStudioFlowNode | undefined, attempt: AutomationStudioNodeAttemptTrace | undefined): string | undefined {
  if (!readsItsWords(node?.parameterValues)) return automationStudioModelFacingControlWords(node?.parameterValues);
  const read = attempt?.status === "succeeded" ? attempt.outputs.value : undefined;
  if (typeof read !== "string" || read.includes(AUTOMATION_STUDIO_WITHHELD_VALUE)) return undefined;
  const words = read.replace(/\s+/gu, " ").trim();
  return words.length <= MAX_READ_WORDS && automationStudioModelFacingControlText(words) ? words : undefined;
}

/** Whether the node's resolved identity says its words are the value it reads (header). */
function readsItsWords(parameters: JsonObject | undefined): boolean {
  const element: JsonValue | undefined = parameters?.element;
  return typeof element === "object" && element !== null && !Array.isArray(element) && element.readsWords === true;
}
