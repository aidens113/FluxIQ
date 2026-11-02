import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function emitAutomationStudioActivityThought(...args: unknown[]): void {
  invokeRuntimeActivityPresentation("emitAutomationStudioActivityThought", args);
}
