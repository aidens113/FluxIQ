import type { AutomationStudioActivityLoopPass } from "../loop/index.ts";
import { invokeRuntimeActivityPresentation } from "./invoke.ts";

type LoopWords = { passOf(nodeId: string, attempts: readonly unknown[]): AutomationStudioActivityLoopPass | undefined; settled(attempt: unknown, attempts: readonly unknown[]): void };

export function automationStudioActivityLoopWords(...args: unknown[]): LoopWords {
  const value = invokeRuntimeActivityPresentation("automationStudioActivityLoopWords", args);
  if (value && typeof value === "object" && "passOf" in value && typeof value.passOf === "function" && "settled" in value && typeof value.settled === "function") return value as LoopWords;
  return { passOf: () => undefined, settled: () => undefined };
}
