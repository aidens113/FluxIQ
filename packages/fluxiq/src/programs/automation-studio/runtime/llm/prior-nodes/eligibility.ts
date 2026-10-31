import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmRerunRecord } from "../rerun-provenance/index.ts";

type Reason = "original_unreadable" | "original_control" | "original_shape" | "declaration_missing" | "declaration_invalid" | "declaration_lasting";
type Eligibility = Readonly<{ kind: "eligible"; input: JsonObject }> | Readonly<{ kind: "unproven"; reason: Reason }>;
const CALL_KEYS = new Set(["node", "parameters", "consequences"]);

/** Eligibility narrows the actual original request; it never manufactures a harmless declaration. */
export function automationStudioLlmPriorNodesEligibility(record: AutomationStudioLlmRerunRecord): Eligibility {
  try {
    const fields = Object.getOwnPropertyDescriptors(record.originalValue);
    if (Reflect.ownKeys(fields).some((key) => typeof key !== "string" || !CALL_KEYS.has(key))) return unproven("original_control");
    const node = fields.node, parameters = fields.parameters, declaration = fields.consequences;
    if (!node || !Object.hasOwn(node, "value") || typeof node.value !== "string" || !node.value.trim()) return unproven("original_shape");
    if (!parameters || !Object.hasOwn(parameters, "value") || !parameters.value || typeof parameters.value !== "object" || Array.isArray(parameters.value)) return unproven("original_shape");
    if (!declaration) return unproven("declaration_missing");
    if (!Object.hasOwn(declaration, "value") || !Array.isArray(declaration.value)) return unproven("declaration_invalid");
    if (declaration.value.length !== 0) return unproven("declaration_lasting");
    return { kind: "eligible", input: { node: record.definitionId, parameters: record.parameters, consequences: structuredClone(declaration.value) } };
  } catch {
    return unproven("original_unreadable");
  }
}

function unproven(reason: Reason): Eligibility {
  return { kind: "unproven", reason };
}
