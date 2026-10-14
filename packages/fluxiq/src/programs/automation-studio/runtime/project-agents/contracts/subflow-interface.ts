import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapInterface, AutomationStudioFlowBootstrapInterfacePort } from "../../flow-bootstrap/plan/index.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";

// A subflow's interface as the structure plan declares it and a brief repeats
// it: the values a calling step passes in and the values the part hands back.

const PORTS = 40;

/** Reads an interface; throws a refusal for `shape.parse`. */
export function readAutomationStudioProjectSubflowInterface(value: unknown, path: string): AutomationStudioFlowBootstrapInterface {
  const fields = shape.object(value, path, ["inputs", "outputs"]);
  const ports = (list: unknown, at: string): AutomationStudioFlowBootstrapInterfacePort[] => {
    const read = shape.array(list, at, PORTS).map((port, index) => readPort(port, `${at}.${index}`));
    if (new Set(read.map((port) => port.id)).size !== read.length) return shape.refuse("project.duplicate", at);
    return read;
  };
  return { inputs: ports(fields.inputs, `${path}.inputs`), outputs: ports(fields.outputs, `${path}.outputs`) };
}

function readPort(value: unknown, path: string): AutomationStudioFlowBootstrapInterfacePort {
  const fields = shape.object(value, path, ["id", "name", "valueType"], ["required", "metadata"]);
  const valueType = shape.object(fields.valueType, `${path}.valueType`, ["kind"]);
  if (valueType.kind !== "unknown") return shape.refuse("project.invalid_choice", `${path}.valueType.kind`);
  const port: AutomationStudioFlowBootstrapInterfacePort = { id: shape.id(fields.id, `${path}.id`), name: shape.text(fields.name, `${path}.name`, 200), valueType: { kind: "unknown" } };
  if (fields.required !== undefined) {
    if (fields.required !== true) return shape.refuse("project.invalid_choice", `${path}.required`);
    port.required = true;
  }
  if (fields.metadata !== undefined) {
    const metadata = shape.object(fields.metadata, `${path}.metadata`, ["binding"]);
    const binding = shape.json(metadata.binding, `${path}.metadata.binding`);
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) return shape.refuse("project.not_object", `${path}.metadata.binding`);
    port.metadata = { binding: binding as JsonObject };
  }
  return port;
}
