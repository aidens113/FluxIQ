import type { JsonObject } from "@fluxiq/contracts/core";
import { AUTOMATION_STUDIO_NODE_CONSEQUENCE_DECLARATION_METADATA_KEY } from "../../../flows/executable/permissions/index.ts";

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
