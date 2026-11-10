// What the Flow needs and gives, with each value's type in words.
import type { AutomationStudioFlowInterface, AutomationStudioFlowPort, AutomationStudioFlowValueType } from "../../interface/index.ts";
import type { OutlineInterface, OutlinePort } from "../types/index.ts";

/** The interface in words; an empty one for a Flow that declares none. */
export function outlineInterfaceOf(flowInterface: AutomationStudioFlowInterface | undefined): OutlineInterface {
  return { needs: (flowInterface?.inputs ?? []).map(portOf), gives: (flowInterface?.outputs ?? []).map(portOf) };
}

function portOf(port: AutomationStudioFlowPort): OutlinePort {
  return { id: port.id, name: port.name || port.id, type: typeWords(port.valueType, 0), required: port.required === true };
}

function typeWords(type: AutomationStudioFlowValueType, depth: number): string {
  switch (type.kind) {
    case "string":
      return "text";
    case "number":
      return "number";
    case "boolean":
      return "yes or no";
    case "null":
      return "nothing";
    case "array":
      return depth > 3 ? "a list" : `a list of ${typeWords(type.item, depth + 1)}`;
    case "record": {
      const fields = Object.keys(type.properties ?? {});
      return fields.length ? `{ ${fields.join(", ")} }` : "a record";
    }
    case "schema":
      return `a ${type.schemaId}`;
    default:
      return "any value";
  }
}
