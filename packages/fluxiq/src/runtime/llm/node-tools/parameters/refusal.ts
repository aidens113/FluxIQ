// A call of a library node whose parameters cannot be what the node takes,
// refused before anything is sent (t1096).
//
// A build named `{"list": ...}` for a node that declares one required
// parameter, `nextPage: {list, control?}`; the call was sent, the page was
// touched, and the answer said only that the outcome was uncertain. Core holds
// the node's definition (`../node-descriptions.ts`) before the domain's
// implementation is called, so a missing required parameter or one the node
// does not declare is known without sending anything, and is refused with the
// shape the node needs. A node with no definition is not checked.
//
// `target` is never an undeclared name: where a node acts on something observed
// the model names it there, and the host fills the node's own parameters from it
// (`./run/node.ts`). A value that is a binding of a written step
// ({"$input"}, {"$row"}, {"$step"}) counts as given. A parameter that declares a
// default is not required of the call.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapCatalogEntry } from "../../../flow-authoring/bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop.ts";

/** The code a refused call carries. */
export const AUTOMATION_STUDIO_LLM_NODE_PARAMETERS_REFUSED_CODE = "core.run_node.parameters_refused";

/** The parameter name a call names an observed thing under, which is never refused as undeclared. */
const TARGET_KEY = "target";

/** The longest account of one parameter's shape sent back, in characters of its JSON. */
const SHAPE_CHARACTERS = 600;

/** The refusal for `parameters` against `definition`, or nothing when the call may go. */
export function automationStudioLlmNodeParametersRefusal(
  definition: Pick<AutomationStudioFlowBootstrapCatalogEntry, "id" | "parameters">,
  parameters: unknown
): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
  if (parameters !== undefined && (typeof parameters !== "object" || parameters === null || Array.isArray(parameters))) return undefined;
  const given = (parameters ?? {}) as Record<string, unknown>;
  const declared = new Map(definition.parameters.map((parameter) => [parameter.id, parameter]));
  const missing = definition.parameters.filter((parameter) => parameter.required === true && parameter.defaultValue === undefined && !(parameter.id in given));
  const undeclared = Object.keys(given).filter((key) => key !== TARGET_KEY && !declared.has(key));
  if (!missing.length && !undeclared.length) return undefined;
  const shape = (parameter: (typeof definition.parameters)[number]): JsonObject => {
    const account: JsonObject = {
      id: parameter.id, type: parameter.type as string, ...(parameter.required === true ? { required: true } : {}),
      ...(parameter.options ? { options: parameter.options } : {}),
      ...(parameter.description ? { description: parameter.description } : {}),
      ...(parameter.example !== undefined ? { example: parameter.example as JsonValue } : {})
    };
    return JSON.stringify(account).length <= SHAPE_CHARACTERS ? account : { id: parameter.id, type: parameter.type as string, ...(parameter.required === true ? { required: true } : {}) };
  };
  const named = [...missing.map((parameter) => parameter.id), ...undeclared];
  const code = AUTOMATION_STUDIO_LLM_NODE_PARAMETERS_REFUSED_CODE;
  const evidence: JsonObject = {
    ok: false, code,
    instruction: `Not sent: ${definition.id} ${missing.length ? `needs ${missing.map((parameter) => parameter.id).join(", ")}` : ""}${missing.length && undeclared.length ? " and " : ""}${undeclared.length ? `does not take ${undeclared.join(", ")}` : ""}. Nothing was done on the page. Call it again with exactly the parameters it declares (shown below).`,
    ...(missing.length ? { missingParameters: missing.map((parameter) => parameter.id) } : {}),
    ...(undeclared.length ? { undeclaredParameters: undeclared } : {}),
    declaredParameters: definition.parameters.map((parameter) => parameter.id),
    shapes: definition.parameters.filter((parameter) => !missing.length || named.includes(parameter.id)).map(shape)
  };
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true, resultCode: code };
}
