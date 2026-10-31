import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import { getAutomationNodeDefinition } from "../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../executor/contracts.ts";
import { collectNodeInputs, collectWiredNodeInputs } from "../executor/node-inputs.ts";
import { automationStudioRefreshInputs } from "../executor/parameter-refresh/index.ts";
import type { AutomationStudioRunState } from "../executor/index.ts";
import { automationStudioRuntimeRepeatDigest } from "./digest.ts";
import { automationStudioRuntimeRepeatExecutionKind } from "./execution-kind.ts";
import type { AutomationStudioRuntimeRepeatEvidence } from "./evidence.ts";

/** Actual cycle dependencies, never the merged bag of earlier output/receipt/capture metadata. */
export function automationStudioRuntimeRepeatCheckpoint(flow: AutomationStudioFlowDocument, nodes: readonly AutomationStudioFlowNode[], values: Record<string, JsonValue>, options: AutomationStudioGraphExecutionOptions, state: AutomationStudioRunState): AutomationStudioRuntimeRepeatEvidence<string> {
  try {
    const dependencies: unknown[] = [];
    for (const node of nodes) {
      const parameters = automationStudioRuntimeRepeatDigest(node.parameterValues ?? {});
      if (parameters.kind === "unavailable") return parameters;
      const resolved = automationStudioRefreshInputs(flow, node, values, options, state.variables);
      if (resolved.missingPaths.length) return { kind: "unavailable", reason: "missing" };
      const definition = getAutomationNodeDefinition(node.definitionId);
      if ((definition?.id === "builtin.data.get-variable" || definition?.id === "builtin.data.set-variable") && typeof resolved.values.name !== "string") return { kind: "unavailable", reason: "unsupported" };
      const collected = collectNodeInputs(flow, node, values);
      const inputs = automationStudioRuntimeRepeatExecutionKind(definition) === "transparent"
        ? Object.fromEntries((definition?.inputs ?? []).map(port => [port.id, constantInput(flow, node, port.id, values, options, state) ?? present(collected[port.id])]))
        : { ...(options.inputs ?? {}), ...collectWiredNodeInputs(flow, node, values) };
      const variable = definition?.id === "builtin.data.get-variable" || definition?.id === "builtin.data.set-variable"
        ? typeof resolved.values.name === "string" ? present(state.variables.get(resolved.values.name.trim())) : { present: false }
        : null;
      dependencies.push([node.id, node.definitionId, resolved.values, inputs, variable]);
    }
    const loops = [...state.loops].map(([id, iteration]) => [id, iteration.index]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    return automationStudioRuntimeRepeatDigest({ dependencies, loops });
  } catch {
    return { kind: "unavailable", reason: "unreadable" };
  }
}

function present(value: JsonValue | undefined): { present: false } | { present: true; value: JsonValue } {
  return value === undefined ? { present: false } : { present: true, value };
}

// A canonical Constant's value is its resolved literal, not a changing cache slot
// initialized on the first turn. Feedback/math/opaque outputs are never substituted.
function constantInput(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, port: string, values: Record<string, JsonValue>, options: AutomationStudioGraphExecutionOptions, state: AutomationStudioRunState): unknown {
  const edge = flow.edges.filter(edge => edge.targetNodeId === node.id && edge.targetPortId === port && edge.sourcePortId).at(-1);
  if (edge?.sourcePortId !== "value") return undefined;
  const source = flow.nodes.find(candidate => candidate.id === edge.sourceNodeId);
  if (!source || source.definitionId !== "builtin.data.constant" || automationStudioRuntimeRepeatExecutionKind(getAutomationNodeDefinition(source.definitionId)) !== "transparent") return undefined;
  if (automationStudioRuntimeRepeatDigest(source.parameterValues ?? {}).kind === "unavailable") throw new Error("runtime_repeat.unproven_dependency");
  const resolved = automationStudioRefreshInputs(flow, source, values, options, state.variables);
  if (resolved.missingPaths.length) throw new Error("runtime_repeat.unproven_dependency");
  return { constant: source.id, value: resolved.values.value ?? null };
}
