import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function emitAutomationStudioActivityClearedWait(...args: unknown[]): void {
  invokeRuntimeActivityPresentation("emitAutomationStudioActivityClearedWait", args);
}
