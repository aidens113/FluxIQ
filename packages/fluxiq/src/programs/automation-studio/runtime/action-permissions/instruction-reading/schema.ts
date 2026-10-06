// The completion the build's one instruction read asks for: the consequence
// question as it is (`../instructed.ts`, `automationStudioInstructedConsequencesSchema`)
// with the route question (`../instruction-route/schema.ts`) beside it, both
// required, in the same single call. The public consequence-only schema is
// left as it was; this combined one is the authority's own
// (`../../service/instruction-authority.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioInstructedConsequencesSchema, type AutomationStudioInstructedActText } from "../instructed.ts";
import { AUTOMATION_STUDIO_INSTRUCTION_ROUTE_SCHEMA } from "../instruction-route/index.ts";

export function automationStudioInstructionReadingSchema(acts: readonly AutomationStudioInstructedActText[]): JsonObject {
  const consequences = structuredClone(automationStudioInstructedConsequencesSchema(acts)) as JsonObject & { required: string[]; properties: Record<string, JsonObject> };
  return {
    ...consequences,
    required: [...consequences.required, "route"],
    properties: { ...consequences.properties, route: structuredClone(AUTOMATION_STUDIO_INSTRUCTION_ROUTE_SCHEMA) }
  };
}
