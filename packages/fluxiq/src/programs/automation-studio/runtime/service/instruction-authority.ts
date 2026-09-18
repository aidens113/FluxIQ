// Reading the person's instruction for what it already asks for, during a build.
//
// One bounded provider call, made through the build's own grant and harness,
// and only when the build first meets an action with a lasting consequence --
// a read-only build never makes it. It is an evidence decision with no tools
// and a completion shaped by `AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA`,
// so it needs no task kind and no grant capability a build does not already
// have. The provider runs it at temperature 0, like every DeepSeek call.
//
// Core keeps only claims whose quote is the person's own words; a failed call
// claims nothing, and the run asks. What it spent is counted with the build.

import {
  AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA,
  readAutomationStudioInstructedConsequences,
  type AutomationStudioInstructedConsequence,
  type AutomationStudioInstructionText
} from "../action-permissions/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, type runAutomationStudioLlmHarness } from "../llm/index.ts";

type HarnessInput = Parameters<typeof runAutomationStudioLlmHarness>[0];
type HarnessResult = Awaited<ReturnType<typeof runAutomationStudioLlmHarness>>;

/** What reading the instruction spent, added to the build's accounting. Zero when it never ran. */
export type AutomationStudioInstructionAuthorityUsage = {
  estimatedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export function automationStudioFlowBootstrapInstructionAuthority(input: {
  run: (request: HarnessInput) => Promise<HarnessResult>;
  projectId: string;
  flowId: string;
  /** The Flow's instructions, as the build's other calls are given them. */
  instructions: HarnessInput["instructions"];
  /** The active ones the build carries out; a quote must be found in one of these. */
  active: readonly AutomationStudioInstructionText[];
  provider: { provider: NonNullable<HarnessInput["provider"]>; tokenLimits?: HarnessInput["tokenLimits"]; timeoutMs?: number };
  maxEstimatedCostUsd?: number | undefined;
}): { derive: () => Promise<readonly AutomationStudioInstructedConsequence[]>; usage: AutomationStudioInstructionAuthorityUsage } {
  const usage: AutomationStudioInstructionAuthorityUsage = { estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  const completionSchema = AUTOMATION_STUDIO_INSTRUCTED_CONSEQUENCES_SCHEMA;
  const derive = async (): Promise<readonly AutomationStudioInstructedConsequence[]> => {
    const answer = await input.run({
      taskKind: "evidence_tool_decision",
      projectId: input.projectId,
      flowId: input.flowId,
      instructions: input.instructions,
      evidenceLoop: { iteration: 1, tools: [], evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema([], completionSchema, true), completionSchema, canComplete: true },
      provider: input.provider.provider,
      ...(input.provider.tokenLimits ? { tokenLimits: input.provider.tokenLimits } : {}),
      ...(input.provider.timeoutMs !== undefined ? { timeoutMs: input.provider.timeoutMs } : {}),
      ...(input.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: input.maxEstimatedCostUsd } : {}),
      expectedOutput: "evidence_tool_decision",
      metadata: { source: "instructionAuthority" }
    });
    usage.estimatedInputTokens += answer.request.estimatedInputTokens;
    usage.inputTokens += answer.usage?.inputTokens ?? 0;
    usage.outputTokens += answer.usage?.outputTokens ?? 0;
    usage.totalTokens += answer.usage?.totalTokens ?? 0;
    usage.estimatedCostUsd += answer.usage?.estimatedCostUsd ?? 0;
    const decision = answer.ok && answer.response?.kind === "evidence_tool_decision" ? answer.response.decision : undefined;
    if (decision?.kind !== "complete") return [];
    return readAutomationStudioInstructedConsequences({ result: decision.result, instructions: input.active });
  };
  return { derive, usage };
}
