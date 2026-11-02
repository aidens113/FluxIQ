import type { JsonObject } from "../../core/index.ts";
import type { RegisteredOutputAction } from "./action.ts";
export function registeredOutputActionFromPayload(payload: JsonObject): RegisteredOutputAction {
  return {
    actionType: typeof payload.outputId === "string" ? payload.outputId : "",
    parameters: payload.parameters && typeof payload.parameters === "object" && !Array.isArray(payload.parameters) ? payload.parameters as JsonObject : {},
    ...(typeof payload.outputId === "string" ? { outputId: payload.outputId } : {}),
    ...(typeof payload.confirmationInputId === "string" && payload.confirmationInputId ? { confirmationInputId: payload.confirmationInputId } : {}),
    ...(typeof payload.confirmationTimeoutMs === "number" ? { confirmationTimeoutMs: payload.confirmationTimeoutMs } : {}),
    ...(payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? { metadata: payload.metadata as JsonObject } : {})
  };
}
