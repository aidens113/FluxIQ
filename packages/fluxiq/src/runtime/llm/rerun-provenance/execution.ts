import { automationStudioLlmRerunFrame } from "./context.ts";
import type { AutomationStudioLlmRerunExecutionAccess, AutomationStudioLlmRerunExecutionInput } from "./types.ts";

/** Read BEFORE ordinary model-handle resolution; active refusals cannot fall back. */
export function automationStudioLlmRerunExecution(input: AutomationStudioLlmRerunExecutionInput): AutomationStudioLlmRerunExecutionAccess {
  const frame = automationStudioLlmRerunFrame();
  return frame?.kind === "execution" ? frame.read(input) : Object.freeze({ kind: "ordinary" });
}
