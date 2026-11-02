import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "../consequences.ts";
import type { AutomationStudioActionPermissionStage, AutomationStudioActionPermissionActionKind } from "../../../flows/executable/permissions/request/index.ts";

/** Core's sentence for a request, built only from what the request carries. */
export function automationStudioActionPermissionSentence(input: {
  stage: AutomationStudioActionPermissionStage;
  kind: AutomationStudioActionPermissionActionKind;
  verb: string;
  controlName: string | null;
  controlKind: string | null;
  missing: readonly AutomationStudioActionConsequence[];
}): string {
  const target = input.controlName === null ? "a control it cannot name here" : `"${input.controlName}"`;
  const kind = input.controlKind === null ? "" : ` (${input.controlKind})`;
  const phrases = automationStudioConsequencesInOrder(input.missing).map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]);
  const would = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}` : phrases[0] ?? "";
  // Written for the person who answers it, in the panel's chat (lane t195's
  // run `run-muny5y17-a927214b` showed it there beside Allow / Don't allow): what
  // FluxIQ would press, what that would do, and why it is asking at all.
  const why = `That would ${would}, and that always needs your permission, even when your instruction asks for it.`;
  if (input.kind === "flow_step" && input.stage === "recovery") {
    return `To fix the step that failed, the Flow would ${input.verb} ${target}${kind} each time it runs. ${why}`;
  }
  if (input.kind === "flow_step") {
    return `The Flow would ${input.verb} ${target}${kind} each time it runs. ${why}`;
  }
  const doing = input.stage === "authoring" ? "to build this Flow" : "to recover the step that failed";
  return `FluxIQ needs to ${input.verb} ${target}${kind} ${doing}. ${why}`;
}
