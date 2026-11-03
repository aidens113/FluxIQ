import type { ClientGatewayCommandContext } from "../../../client-gateway/service/command-ledger/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import type { RuntimeService } from "../../../runtime/index.ts";
import type { PolicyAction } from "../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../components/automation/index.ts";
import { dispatchRegisteredOutput, createIoOutputEffectDispatcher, createRuntimeOutputEffectDispatcher, type OutputTargetPreparationPort } from "../../../runtime/output-dispatch/index.ts";
type PolicyOutputAction = Pick<PolicyAction, "outputId" | "actionType" | "parameters" | "confirmationInputId" | "confirmationTimeoutMs" | "metadata">;
export async function dispatchPolicyOutput(io: IoRegistry, domainId: string | null | undefined, action: PolicyOutputAction, signal?: AbortSignal, commandContext?: ClientGatewayCommandContext, targetPreparer?: OutputTargetPreparationPort): Promise<AutomationNodeExecutionResult> {
  return dispatchRegisteredOutput(io, domainId, action, signal, commandContext, targetPreparer);
}
export function createIoPolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, targetPreparer?: OutputTargetPreparationPort) {
  return createIoOutputEffectDispatcher(io, domainId, targetPreparer);
}
export function createRuntimePolicyEffectDispatcher(io: IoRegistry, domainId: string | null | undefined, runtime: RuntimeService, targetPreparer?: OutputTargetPreparationPort) {
  return createRuntimeOutputEffectDispatcher(io, domainId, runtime, targetPreparer);
}
