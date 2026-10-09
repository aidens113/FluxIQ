// What a Flow requires a runtime to support (t388, contract C10), read off
// what each of its Subflows holds once the script is assembled: a handler
// registration, a call to a part, or a fact the host must observe -- an
// entry's or checkpoint's `when`, a handler's `when` or completion check, or a
// success check. A Flow holding none declares nothing and runs as before.
import type { JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS,
  type AutomationStudioFlowBootstrapSubflow
} from "../plan/index.ts";

/** What one Subflow requires a runtime to support (C10), read off what it holds. */
export function automationStudioFlowBootstrapSubflowRequires(subflow: AutomationStudioFlowBootstrapSubflow): string[] {
  const ids = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS;
  const holds = (id: string) => subflow.nodes.some((node) => node.definitionId === id);
  const tested = (value: JsonValue | undefined) => Array.isArray(value) && value.length > 0;
  const facts = Boolean(subflow.metadata?.["fluxiq.successCheck"]?.length)
    || subflow.nodes.some((node) => Boolean(node.metadata?.["fluxiq.entry"]?.when.length || node.metadata?.["fluxiq.checkpoint"]?.when?.length)
      || (node.definitionId === ids.handler && (tested(node.parameters?.when) || tested(node.parameters?.completionCheck))));
  return [
    ...(holds(ids.handler) ? [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS.handlers] : []),
    ...(holds(ids.callSubflow) ? [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS.subflowCalls] : []),
    ...(facts ? [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS.facts] : [])
  ];
}
