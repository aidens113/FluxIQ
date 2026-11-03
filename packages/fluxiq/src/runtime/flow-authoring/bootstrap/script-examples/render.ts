import type { AutomationStudioFlowScriptExamples } from "./contracts.ts";

/** Join explicit Core prefixes with exact client tails, with no inferred examples. */
export function renderAutomationStudioFlowScriptExamples(
  grammar: Readonly<Record<"format" | "act" | "loop" | "state", string>>,
  examples?: AutomationStudioFlowScriptExamples
): Record<"format" | "act" | "loop" | "state", string> {
  const section = (name: "format" | "act" | "loop" | "state"): string => {
    const lines = examples?.[name];
    return lines?.length ? `${grammar[name]}\n${lines.join("\n")}` : grammar[name];
  };
  return { format: section("format"), act: section("act"), loop: section("loop"), state: section("state") };
}
