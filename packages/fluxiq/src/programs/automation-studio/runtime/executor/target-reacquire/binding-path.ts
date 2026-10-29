// The run-state path a parameter's state binding reads, with a node-output
// reference resolved to the id the run keeps that node's outputs under (t786).
//
// A binding `$node.<key>.<output>[.<field>]` names another node by its key in
// the graph; the executor resolves the key when the reading node runs
// (`../node-inputs.ts`). The lineage and the re-acquire read the same path the
// attempt will read, so they ask that same resolver rather than a second one.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";
import { automationStudioNodeOutputReferences } from "../node-inputs.ts";

/** The path `value` reads when it is a state binding, its node-output reference resolved; nothing when it is no binding. */
export function automationStudioReacquireStatePath(flow: AutomationStudioFlowDocument, value: JsonValue | undefined): string | undefined {
  if (value === undefined || !isAutomationNodeParameterStateBinding(value)) return undefined;
  const resolved = automationStudioNodeOutputReferences(flow, { bound: value }).bound;
  return isAutomationNodeParameterStateBinding(resolved) ? resolved.$state.path.trim() : undefined;
}
