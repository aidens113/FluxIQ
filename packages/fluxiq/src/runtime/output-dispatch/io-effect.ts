import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { ClientGatewayCommandContext } from "../../client-gateway/service/command-ledger/index.ts";
import type { AutomationNodeExecutionResult } from "../../components/automation/index.ts";
import type { OutputDispatchIo } from "./ports/index.ts";
import type { OutputTargetPreparationPort } from "./contracts/index.ts";
import { registeredOutputActionFromPayload } from "./effect-action.ts";
import { dispatchRegisteredOutput } from "./io.ts";
import { OutputObservationBindings } from "./admission/internal/index.ts";
export function createIoOutputEffectDispatcher(io: OutputDispatchIo, domainId: string | null | undefined, targetPreparer?: OutputTargetPreparationPort) {
  return async (effect: {
    type: string;
    payload?: JsonValue;
  }, context?: {
    signal?: AbortSignal;
    commandContext?: ClientGatewayCommandContext;
  }): Promise<AutomationNodeExecutionResult | undefined> => {
    if (effect.type !== "policy.output.dispatch" || !effect.payload || typeof effect.payload !== "object" || Array.isArray(effect.payload))
      return undefined;
    const payload = effect.payload as JsonObject;
    const action = registeredOutputActionFromPayload(payload);
    return dispatchRegisteredOutput(io, domainId, action, context?.signal, context?.commandContext, targetPreparer, OutputObservationBindings.take(context));
  };
}
