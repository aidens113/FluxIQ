import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioResultActStep } from "./act-steps.ts";

/**
 * Why Core does not find one act defect in its record of the steps the run
 * took (header, `./index.ts`, t766), or nothing where it does. The steps are
 * evidence apart from the result's rows, so a result that also stores rows
 * takes an act defect too, and a row claim beside it still needs its row.
 *
 * - `act_wrong` names a step Core holds, by its node id, label or build test
 *   number, and that step acts rather than reads.
 * - `act_missing` names what the act is done to, and no step Core holds says
 *   it: a step whose own words name it is a step that did that act.
 */
export function automationStudioResultActDefectNotFound(
  defect: AutomationStudioLlmVerificationDefect,
  steps: readonly AutomationStudioResultActStep[]
): string | undefined {
  const quoted = `"${defect.row}"`;
  if (defect.kind === "act_wrong") {
    const named = fold(defect.step ?? "");
    const step = named ? steps.find((one) => one.names.some((name) => fold(name) === named || `step ${fold(name)}` === named)) : undefined;
    if (!step) return `"${defect.step ?? ""}" is no step of this run Core holds.`;
    if (step.reads) return `"${defect.step}" is a step that reads rows, not one that acts: a defect of what it read is a row defect.`;
    return undefined;
  }
  const target = fold(defect.row);
  if (!target) return `${quoted} names nothing an act is done to.`;
  const doing = steps.find((one) => !one.reads && one.words.some((word) => fold(word).includes(target)));
  return doing ? `${quoted} is named by step "${doing.names[0]}", which this run took.` : undefined;
}

/** A text as names and words are compared: lower case, quotes and closing stops dropped, each run of spaces one. */
function fold(text: string): string {
  return text.toLowerCase().replace(/["“”'‘’]/gu, "").replace(/\s+/gu, " ").replace(/[\s.,;:]+$/u, "").trim();
}
