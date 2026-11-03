import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function emitAutomationStudioActivityAskResolved(...args: unknown[]): void {
  invokeRuntimeActivityPresentation("emitAutomationStudioActivityAskResolved", args);
}
