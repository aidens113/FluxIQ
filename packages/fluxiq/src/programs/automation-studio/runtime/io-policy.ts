import type { ClientGatewayCommandContext } from "../../../client-gateway/service/command-ledger/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import type { RuntimeService } from "../../../runtime/index.ts";
import type { PolicyAction } from "../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import type { ElementMatcher } from "../../../runtime/target-matching/index.ts";
import { dispatchRegisteredOutput, createIoOutputEffectDispatcher, createRuntimeOutputEffectDispatcher } from "../../../runtime/output-dispatch/index.ts";
import { createAutomationStudioOutputTargetPreparer } from "./output-target/index.ts";
type PolicyOutputAction = Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">;
export async function dispatchPolicyOutput(io: IoRegistry, domainId: string | null | undefined, action: PolicyOutputAction, signal?: AbortSignal, commandContext?: ClientGatewayCommandContext, elementMatcher?: ElementMatcher): Promise<AutomationNodeExecutionResult> {
  return dispatchRegisteredOutput(io, domainId, action, signal, commandContext, createAutomationStudioOutputTargetPreparer(elementMatcher));
}
export function createIoPolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, elementMatcher?: ElementMatcher) {
  return createIoOutputEffectDispatcher(io, domainId, createAutomationStudioOutputTargetPreparer(elementMatcher));
}
export function createRuntimePolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, runtime: RuntimeService, elementMatcher?: ElementMatcher) {
  return createRuntimeOutputEffectDispatcher(io, domainId, runtime, createAutomationStudioOutputTargetPreparer(elementMatcher));
}
