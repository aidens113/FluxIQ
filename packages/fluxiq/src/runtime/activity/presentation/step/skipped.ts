import { invokeRuntimeActivityPresentation } from "../invoke.ts";

export function emitAutomationStudioActivityStepSkipped(...args: unknown[]): void {
  invokeRuntimeActivityPresentation("emitAutomationStudioActivityStepSkipped", args);
}
