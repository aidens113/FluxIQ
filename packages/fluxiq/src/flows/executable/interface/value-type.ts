import type { JsonObject, JsonValue } from "../../../core/index.ts";
export type AutomationStudioFlowValueType =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "json" }
  | { kind: "unknown" }
  | { kind: "array"; item: AutomationStudioFlowValueType }
  | { kind: "record"; properties?: Record<string, AutomationStudioFlowValueType>; additionalProperties?: boolean }
  | { kind: "schema"; schemaId: string; schemaVersion?: string };
