import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioTargetRefreshResolution } from "./resolution.ts";

/** Derives a fixed flat write-set only from the bound canonical registry. */
export function automationStudioResolveTargetRefresh(node: AutomationStudioFlowNode, parameters: Readonly<Record<string, JsonValue>>, own: AutomationStudioNodeDefinition | undefined, outputs: readonly AutomationStudioNodeDefinition[]): AutomationStudioTargetRefreshResolution {
  try {
    let definition = own;
    if (own && node.definitionVersion && node.definitionVersion !== own.version) return { kind: "rejected", reason: "invalid_declaration" };
    const container = node.definitionId === "builtin.policy.action" ? "output" : "node";
    if (container === "output") {
      if (typeof parameters.outputId !== "string" || !parameters.outputId.trim() || !parameters.parameters || typeof parameters.parameters !== "object" || Array.isArray(parameters.parameters) || "$state" in parameters.parameters) return { kind: "rejected", reason: "invalid_output" };
      const id = parameters.outputId.trim();
      const matches = outputs.filter((candidate) => candidate.outputAction?.fixedOutputId === id || candidate.outputAction?.allowedOutputIds?.includes(id));
      if (matches.length > 1) return { kind: "rejected", reason: "ambiguous_definition" };
      definition = matches[0];
    }
    if (!definition) return { kind: "absent", reason: "unregistered_definition" };
    const selected = definition.parameters.filter((parameter) => Object.getOwnPropertyDescriptor(parameter, "targetRefresh")?.value === true);
    if (!selected.length) return { kind: "absent", reason: "no_refresh_declaration" };
    const ids = selected.map((parameter) => parameter.id);
    if (new Set(definition.parameters.map((parameter) => parameter.id)).size !== definition.parameters.length || ids.some((id) => !id.trim() || id !== id.trim() || ["__proto__", "constructor", "prototype"].includes(id) || id === definition.actionEffect?.commitWhen)) return { kind: "rejected", reason: "invalid_declaration" };
    return { kind: "declared", refresh: { container, definitionId: definition.id, definitionVersion: definition.version, parameterIds: ids, removableParameterIds: selected.filter((parameter) => !parameter.required).map((parameter) => parameter.id) } };
  } catch {
    return { kind: "unreadable", reason: "registry_unreadable" };
  }
}
