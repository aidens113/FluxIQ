import type { AutomationStudioLlmEvidenceLoopDecision, AutomationStudioLlmEvidenceLoopResult, AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import type { automationStudioLlmEvidenceToolAdmission } from "../prior-nodes/index.ts";
import { announceAutomationStudioStallRecovery } from "./announce.ts";

type Call = Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>;

/** Stall recovery has the same ordinary admission and budget gates as a model-requested call. */
export function createAutomationStudioStallRecoveryEntry(input: {
  readonly signal?: AbortSignal | undefined;
  canRun(): boolean;
  admit(call: Call): ReturnType<typeof automationStudioLlmEvidenceToolAdmission> | undefined;
  run(iteration: number, call: Call, tool: AutomationStudioLlmEvidenceTool, signature: string): Promise<AutomationStudioLlmEvidenceLoopResult | undefined>;
  exhausted(): AutomationStudioLlmEvidenceLoopResult;
  refused(): AutomationStudioLlmEvidenceLoopResult;
  recovered(): void;
}) {
  return async (iteration: number, call: Call): Promise<AutomationStudioLlmEvidenceLoopResult | undefined> => {
    if (input.signal?.aborted || !input.canRun()) return input.exhausted();
    const admitted = input.admit(call);
    if (!admitted?.tool || admitted.withdrawn || admitted.deadline || admitted.final || admitted.triedHere || admitted.answered || admitted.nodeOffered === false || typeof admitted.signature !== "string") return input.refused();
    announceAutomationStudioStallRecovery(call);
    input.recovered();
    return await input.run(iteration, call, admitted.tool, admitted.signature);
  };
}
