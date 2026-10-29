// What a stale step is bound to now, read from the run's values as its next
// attempt would read it (t786, design D3).

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationNodeStateBinding, resolveAutomationNodeParameterValues } from "../../../nodes/index.ts";
import { automationStudioReacquireStatePath } from "./binding-path.ts";
import type { AutomationStudioTargetLineage } from "./contracts.ts";

/**
 * The stale value, and where a fresh one goes:
 *
 * - `row`: the pass's row, as the loop handed it (`<loop>.item`, else `item`);
 *   a found row is written back under both keys.
 * - `output`: the value the step's bound parameter reads; `path` is the run
 *   path that binding reads (`<source>.<output>[.<field>]`), which a found value
 *   is laid over for the step's remaining attempts, and `field` the part of it
 *   below the source's output, which the fresh answer is read at.
 *
 * Nothing when the run holds no such value: there is nothing to match.
 */
export function automationStudioReacquireBoundValue(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  lineage: AutomationStudioTargetLineage,
  values: Readonly<Record<string, JsonValue>>
): { stale: JsonValue; path?: string; field: readonly string[] } | undefined {
  if (lineage.kind === "row") {
    const stale = (lineage.loopNodeId ? values[`${lineage.loopNodeId}.item`] : undefined) ?? values.item;
    return stale === undefined || stale === null ? undefined : { stale, field: [] };
  }
  const path = automationStudioReacquireStatePath(flow, parameterAt(node.parameterValues ?? {}, lineage.parameterPath ?? ""));
  const output = `${lineage.sourceNodeId}.${lineage.outputKey}`;
  if (!path || (path !== output && !path.startsWith(`${output}.`))) return undefined;
  const read = resolveAutomationNodeParameterValues({ bound: automationNodeStateBinding(path) }, { ...values });
  const stale = read.values.bound;
  if (stale === undefined || read.missingPaths.length) return undefined;
  return { stale, path, field: path === output ? [] : path.slice(output.length + 1).split(".") };
}

/** The value at a dotted parameter path, through objects and arrays. */
function parameterAt(parameters: Readonly<Record<string, JsonValue>>, dotted: string): JsonValue | undefined {
  let current: JsonValue | undefined = parameters;
  for (const segment of dotted.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = Array.isArray(current) ? current[Number(segment)] : current[segment];
  }
  return current;
}
