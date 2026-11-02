import { invokeRuntimeActivityPresentation } from "../invoke.ts";

export function emitAutomationStudioActivityStep(...args: unknown[]): void {
  invokeRuntimeActivityPresentation("emitAutomationStudioActivityStep", args);
}
