// What a Flow step says its own action would lastingly do, as the model wrote it.
//
// The permission seam points one way (`action-permissions/declaration.ts`):
// the domain, which alone knows what a control is, names it and the verb; Core,
// which alone holds the person's grant, answers. Neither of them knows what a
// *step* would cause -- only the model does, having explored the page. So the
// model declares it, step by step, exactly as it already declares the
// consequences of a press it makes while exploring.
//
// **Where the declaration rides, and what a live run taught about it.** The
// declaration belongs on the node as its own field, reserved in the Flow script
// exactly as `outputActionId` already is: a single-segment step word the
// authoring readers take instead of refusing. It is read here off `node
// .consequences`. A step's parameters are read as a fallback, for a caller that
// already has it there.
//
// It cannot ride on the parameters alone, which was this module's first design
// and which `run-mud7fssy-902f877b` disproved in one build: the authoring
// readers refuse any step key the node's definition does not declare
// (`flow-bootstrap/authoring/assemble.ts` and `normalise.ts`), long before
// resolution, so the model wrote a `consequences:` line, was answered
// `bootstrap.unknown_parameter`, and stopped writing it. The reserved-word edits
// that carry it are named in this task's report; until they land, nothing the
// model writes reaches here.
//
// Whatever it rides on, it is taken off before the domain or the registry sees
// the parameters, so a Flow never runs a parameter no node declares.
//
// **Fail closed.** A declaration Core cannot read is not a declaration: the
// step is refused rather than resolved as though it had said nothing. A step
// that declares nothing at all is a different thing, reported as `undefined`,
// and what to do about it is the domain's call -- it is the only side that
// knows whether the step acts.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";

/**
 * The field and the step word a consequence declaration is written as, and the
 * word the Flow script format tells the model to write. One spelling, named
 * once, for the node field, the reserved step word and the parameter fallback.
 */
export const AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY = "consequences";

/** The word a step writes to say plainly that it causes nothing lasting. */
const NOTHING_LASTING = "none";

/**
 * A step's declaration, read out of its parameters.
 *
 * - `declared` absent: the step said nothing. The domain decides whether a step
 *   of its kind may leave it unsaid.
 * - `declared` empty: the step said, in so many words, that it causes nothing
 *   lasting. Nothing is asked of anybody.
 * - `malformed`: something was written and Core could not read it as its own
 *   classes. The step is refused.
 */
export type AutomationStudioPlanStepConsequences = {
  declared?: AutomationStudioActionConsequence[] | undefined;
  malformed?: true;
  /** The step's parameters without the declaration: what the domain and the registry see. */
  parameters: JsonObject;
  /** Whether it rode on the parameters, so a caller knows those changed and must be written back. */
  rodeOnParameters: boolean;
};

/** How many classes one step may name, past which the declaration is not one. */
const MAX_DECLARED = 10;

/** Read a step's declaration, and take it out of the parameters if it rode there. */
export function automationStudioPlanStepConsequences(node: { consequences?: unknown; parameters?: JsonObject | undefined } | undefined): AutomationStudioPlanStepConsequences {
  const given = node?.parameters ?? {};
  const onParameters = Object.hasOwn(given, AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY);
  if (node?.consequences === undefined && !onParameters) return { parameters: given, rodeOnParameters: false };
  const { [AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY]: rode, ...rest } = given;
  const declared = readDeclaration(node?.consequences === undefined ? rode : node.consequences);
  return declared === "malformed"
    ? { malformed: true, parameters: rest, rodeOnParameters: onParameters }
    : { declared, parameters: rest, rodeOnParameters: onParameters };
}

/**
 * The classes written, in Core's order, or `malformed`.
 *
 * Both shapes the script can produce are read: a list line is one string with
 * commas in it, and a model that returned the nested plan instead writes an
 * array. `none`, and a line with nothing after the colon, are the plain way to
 * say that the step causes nothing lasting.
 */
function readDeclaration(written: unknown): AutomationStudioActionConsequence[] | "malformed" {
  const given = typeof written === "string" ? written.split(",") : Array.isArray(written) ? written : "malformed";
  const words = given === "malformed"
    ? given
    : given.map((word) => (typeof word === "string" ? word.trim().toLowerCase() : word)).filter((word) => word !== "");
  if (words === "malformed" || words.length > MAX_DECLARED) return "malformed";
  if (words.length === 1 && words[0] === NOTHING_LASTING) return [];
  if (!words.every(isAutomationStudioActionConsequence)) return "malformed";
  return automationStudioConsequencesInOrder(words);
}
