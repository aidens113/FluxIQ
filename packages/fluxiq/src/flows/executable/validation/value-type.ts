import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowValueType } from "../interface/index.ts";
import { addIssue, type AutomationStudioValidationIssue } from "./issue.ts";

export function validateFlowValueType(valueType: AutomationStudioFlowValueType, issues: AutomationStudioValidationIssue[], path: string): void {
  if (valueType.kind === "array") {
    validateFlowValueType(valueType.item, issues, `${path}.item`);
  } else if (valueType.kind === "record" && valueType.properties) {
    for (const [key, property] of Object.entries(valueType.properties)) {
      if (!key.trim()) addIssue(issues, "error", "flow.record_property_missing_name", "Record type property must have a name.", `${path}.properties.${key}`);
      validateFlowValueType(property, issues, `${path}.properties.${key}`);
    }
  } else if (valueType.kind === "schema" && !valueType.schemaId.trim()) {
    addIssue(issues, "error", "flow.schema_type_missing_id", "Schema value type must have a schemaId.", `${path}.schemaId`);
  }
}

export function valueMatchesFlowType(value: JsonValue, valueType: AutomationStudioFlowValueType): boolean {
  switch (valueType.kind) {
    case "unknown":
    case "json": return true;
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "schema": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value) && value.every((item) => valueMatchesFlowType(item, valueType.item));
    case "record": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, JsonValue>;
      const properties = valueType.properties ?? {};
      if (Object.entries(properties).some(([key, type]) => key in record && !valueMatchesFlowType(record[key]!, type))) return false;
      return valueType.additionalProperties !== false || Object.keys(record).every((key) => key in properties);
    }
  }
}
