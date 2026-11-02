import type { JsonObject } from "@fluxiq/contracts/core";

/** Compose supplied schema parts; instruction/domain wording stays with the caller. */
export function composeActionInstructionReadingSchema(consequenceSchema: JsonObject, routeSchema: JsonObject): JsonObject {
  const consequences = structuredClone(consequenceSchema) as JsonObject & { required: string[]; properties: Record<string, JsonObject> };
  return {
    ...consequences,
    required: [...consequences.required, "route"],
    properties: { ...consequences.properties, route: structuredClone(routeSchema) }
  };
}
