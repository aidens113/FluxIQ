import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function emitAutomationStudioActivityWaitingOnAsk(...args: unknown[]): void {
  invokeRuntimeActivityPresentation("emitAutomationStudioActivityWaitingOnAsk", args);
}
