import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function automationStudioActivityRecoveryChoice(...args: unknown[]): { title: string; text: string } {
  const value = invokeRuntimeActivityPresentation("automationStudioActivityRecoveryChoice", args);
  if (value && typeof value === "object" && "title" in value && typeof value.title === "string" && "text" in value && typeof value.text === "string") return { title: value.title, text: value.text };
  return { title: "Recovery", text: "" };
}
