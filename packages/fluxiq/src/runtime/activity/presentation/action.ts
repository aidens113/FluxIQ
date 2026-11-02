import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function automationStudioActivityAction(...args: unknown[]): string | undefined {
  const value = invokeRuntimeActivityPresentation("automationStudioActivityAction", args);
  return typeof value === "string" ? value : undefined;
}
