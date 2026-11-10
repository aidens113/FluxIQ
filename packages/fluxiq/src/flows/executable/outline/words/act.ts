// An act's words (rule 7): the domain's own sentence for the output when its
// `describeOutput` hook gives one, folded and bounded the way a draft line's
// words are (`runtime/flow-authoring/draft/step-words.ts`); otherwise the
// card's words, the build's label when it reads as plain words or the plain
// name of the step.
import type { ProjectPartStep } from "../../../../api-contracts/automation/index.ts";
import { automationStudioFlowDraftStepWordsOf } from "../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import type { FlowOutlineOptions } from "../types/index.ts";
import { outlinePartStepOf } from "./part-step.ts";

/** The words and declared lasting classes of a step that acts. */
export function outlineActWords(node: AutomationStudioFlowNode, describeOutput: FlowOutlineOptions["describeOutput"]): { words: string; lasting: ProjectPartStep["lastingClasses"] } {
  const part = outlinePartStepOf(node);
  const described = describeOutput
    ? automationStudioFlowDraftStepWordsOf((call) => ({ text: describeOutput(call.toolId, call.value) }), { toolId: part.step.kind, value: part.step.params })?.text
    : undefined;
  return { words: described ?? part.said.label, lasting: part.said.lastingClasses };
}
