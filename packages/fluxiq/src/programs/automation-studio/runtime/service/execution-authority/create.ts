import type { AutomationStudioFlowScope } from "../../../model/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioFlowBootstrapPersonNeeded } from "../../flow-bootstrap/index.ts";
import { automationStudioFlowDraftReplayClearedCode } from "../../llm/node-tools/index.ts";
import { automationStudioLlmPriorNodesRuntimeAuthority } from "../../llm/prior-nodes/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../native-node-runtime.ts";

/** Assemble one build's actual permission, person-needed and current rerun authority boundaries together. */
export function automationStudioFlowBootstrapExecutionAuthority(input: {
  permission: Parameters<typeof automationStudioFlowBootstrapActionPermissions>[0];
  tools: Parameters<typeof automationStudioFlowBootstrapPersonNeeded>[0]["tools"];
  ask?: Parameters<typeof automationStudioFlowBootstrapPersonNeeded>[0]["ask"] | undefined;
  signal?: AbortSignal | undefined;
  generation: object;
  runtime(): AutomationStudioNativeNodeRuntime | undefined;
  binding(): object | undefined;
  scope: AutomationStudioFlowScope;
}) {
  const permissions = automationStudioFlowBootstrapActionPermissions(input.permission);
  // A person-only check and a permission request stay on this build's own thread and signal.
  const personNeeded = automationStudioFlowBootstrapPersonNeeded({
    executeTool: permissions.executeTool, tools: input.tools,
    signal: AbortSignal.any([permissions.signal, ...(input.signal ? [input.signal] : [])]),
    clearedResultCode: automationStudioFlowDraftReplayClearedCode,
    ...(input.ask ? { ask: input.ask } : {})
  });
  const rerunAuthority = automationStudioLlmPriorNodesRuntimeAuthority({
    runtime: input.runtime, binding: input.binding, generation: input.generation,
    authority: permissions, scope: input.scope, signal: personNeeded.signal
  });
  return { permissions, personNeeded, rerunAuthority };
}
