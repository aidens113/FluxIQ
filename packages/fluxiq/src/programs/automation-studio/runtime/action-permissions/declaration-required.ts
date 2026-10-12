// Whether a step must declare its consequences, as its node's domain says.
//
// Which actions commit is a domain's fact, never Core's: the same press applies
// a filter on one page and places an order on the next, and only the domain
// knows that its press is a press. A domain states it on each node definition
// under `consequenceDeclaration`:
//
//   "required"                 every step of the node declares (`[]` for none);
//   "not_required"             no step of it needs to (it opens, chooses, types
//                              without submitting, reads);
//   { requiredWhen: "<param>" } a step declares when that boolean parameter is
//                              `true` (a typing step that submits its form).
//
// Absent or unreadable is "required". That is the safe reading: Core's gate is
// asked about an action from its declaration, and an action that declared
// nothing is never asked about (`./gate.ts`), so a saved step is run unasked
// only where its domain said it has nothing to ask about (t439, supervisor
// review: a saved press with no declaration must not be run blind in a test).

import type { JsonObject } from "../../../../core/index.ts";

/** The node-definition metadata key a domain states its declaration rule under. */
export const AUTOMATION_STUDIO_NODE_CONSEQUENCE_DECLARATION_METADATA_KEY = "consequenceDeclaration";

/** Whether a step of a node with this definition metadata, run with these parameters, must declare its consequences. */
export function automationStudioNodeDeclarationRequired(metadata: Readonly<Record<string, unknown>> | undefined, parameters: JsonObject | undefined): boolean {
  const rule = metadata?.[AUTOMATION_STUDIO_NODE_CONSEQUENCE_DECLARATION_METADATA_KEY];
  if (rule === "not_required") return false;
  if (rule && typeof rule === "object" && !Array.isArray(rule)) {
    const when = (rule as { requiredWhen?: unknown }).requiredWhen;
    if (typeof when === "string" && when) return parameters?.[when] === true;
  }
  return true;
}
