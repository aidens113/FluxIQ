// A step of a saved part, said to a person. Its label is the one the build gave it
// only when that reads as plain words: it passes the card's own person-words screen
// and holds no word that is an identifier (joined by a hyphen, an underscore or a dot,
// or run together in camel case). Anything else is replaced by the plain name of what
// the step is, read from its definition. The step's target, its parameter values and
// whatever it read are never looked at.
import { AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES, type AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import type { ProjectPartStep } from "../../../../api-contracts/automation.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../../engine/automation/defensive/index.ts";
import { automationStudioScreenedPartWords, type AutomationStudioPartStep } from "../../../../runtime/project-parts/index.ts";

/** A part this step calls: its name, and the lasting classes its steps can cause. */
export type ProjectPartStepCallee = { name: string; lastingClasses: readonly AutomationStudioAttemptActClass[] };

const IDENTIFIER_WORD = /[\p{L}\p{N}][-_./\\@#:][\p{L}\p{N}]|\p{Ll}\p{Lu}|\p{L}\p{N}|\p{N}\p{L}/u;

export function projectPartStepOf(step: AutomationStudioPartStep, callee: ProjectPartStepCallee | undefined): ProjectPartStep {
  if (step.isCall) return { label: callee ? `Run ${callee.name}` : "Run a saved part", lastingClasses: [...(callee?.lastingClasses ?? [])] };
  return { label: labelOf(step), lastingClasses: declaredClassesOf(step) };
}

function labelOf(step: AutomationStudioPartStep): string {
  const label = automationStudioScreenedPartWords(step.node.label, "name");
  const words = label?.replace(/[.,;:!?]+$/u, "").split(" ") ?? [];
  return label && !words.some((word) => IDENTIFIER_WORD.test(word)) ? label : plainNameOf(step.kind);
}

/** `web.output.dom-click` is "Dom click": the last part of the definition's id, in words. */
function plainNameOf(kind: string): string {
  const last = (kind.split(".").pop() ?? kind).replace(/[-_]+/gu, " ").trim();
  return last ? `${last[0]!.toUpperCase()}${last.slice(1)}` : "A step";
}

function declaredClassesOf(step: AutomationStudioPartStep): AutomationStudioAttemptActClass[] {
  const declared = step.node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  return Array.isArray(declared) ? AUTOMATION_STUDIO_ATTEMPT_ACT_CLASSES.filter((known) => declared.includes(known)) : [];
}
