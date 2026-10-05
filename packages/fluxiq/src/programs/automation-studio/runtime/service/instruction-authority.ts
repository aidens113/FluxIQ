// Reading the person's instruction for what it already asks for, during a build.
//
// One bounded provider call, made through the build's own provider and harness.
// It is an evidence decision with no tools and a completion shaped by
// `automationStudioInstructedConsequencesSchema`, so it needs no task kind a
// build does not already have. The provider runs it at temperature 0, like
// every DeepSeek call.
//
// **When it is made.** Never from inside a call the domain is already running:
// the build's gate makes it before handing on the first exploration call that
// declares a lasting consequence (`../flow-bootstrap/action-permissions.ts`),
// and otherwise at the first of the build's first test, its completion check,
// or the cross-check after the build -- whichever needs it first. Once per
// build; a build that never needs it never makes it. Run
// `run-musp8nz1-dbd3905a` made it inside its Add to cart press (step 0031
// overlapping 0030), because the gate derived it while the domain was asking
// whether that press was permitted.
//
// **What it is asked (t174-w107).** About the instruction's acts, one answer
// per act: the acts are read from the person's words with no model
// (`../flow-bootstrap/instructed-acts/instruction-acts.ts`), from the same text
// the service reads the build's checklist from, so their ids are the
// checklist's. The question names each act by id with its quote and asks what
// lasting consequences that act asks for; the free question for anything else
// the words ask stays beside it (`../action-permissions/instructed.ts`). An
// act split from a clause with several counted objects carries that clause
// (`source`, t262), so its answer is grounded in the person's contiguous words
// rather than the quote Core assembled for it. The decision itself is described as a read of the instruction with no page and
// nothing to do next, summary included, because the read shares a page
// decision's envelope and system prompt, and that run's read summarised itself
// as a page step ("Reading the Farbazaar page to find the ... listing").
//
// Core keeps only claims whose quote is the person's own words. A failed call
// claims nothing and answers no act, so each act is treated as lasting by the
// build's tests (as is any act whose kind lasts, whatever the read said); the
// gate still asks. What it spent is counted with the build.

import {
  automationStudioInstructedConsequencesSchema,
  automationStudioInstructedReadUnanswered,
  readAutomationStudioInstructedRead,
  type AutomationStudioInstructedRead,
  type AutomationStudioInstructionText
} from "../action-permissions/index.ts";
import { automationStudioInstructedActs } from "../flow-bootstrap/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, type runAutomationStudioLlmHarness } from "../llm/index.ts";
import type { JsonObject } from "../../../../core/index.ts";

type HarnessInput = Parameters<typeof runAutomationStudioLlmHarness>[0];
type HarnessResult = Awaited<ReturnType<typeof runAutomationStudioLlmHarness>>;

/** What reading the instruction spent, added to the build's accounting. Zero when it never ran. */
export type AutomationStudioInstructionAuthorityUsage = {
  /**
   * How many provider calls this made. Counted, because the build's own
   * `providerCallCount` comes from the evidence loop's trace and this call is
   * not in it -- so every per-build call count published anywhere was short by
   * exactly this, silently, while its tokens and its money were counted.
   */
  calls: number;
  estimatedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

/** What this decision is, said where its answer is shaped: a read of the instruction, not a next step on a page. */
const READ_DECISION = "This call reads the person's instructions alone: there is no page here and nothing to do next, so complete at once. Write summary as one plain sentence saying what the instructions ask for, act by act.";

export function automationStudioFlowBootstrapInstructionAuthority(input: {
  run: (request: HarnessInput) => Promise<HarnessResult>;
  projectId: string;
  flowId: string;
  /** The Flow's instructions, as the build's other calls are given them. */
  instructions: HarnessInput["instructions"];
  /** The active ones the build carries out; a quote must be found in one of these, and the acts are read from them. */
  active: readonly AutomationStudioInstructionText[];
  provider: { provider: NonNullable<HarnessInput["provider"]>; tokenLimits?: HarnessInput["tokenLimits"]; timeoutMs?: number };
  maxEstimatedCostUsd?: number | undefined;
}): { derive: () => Promise<AutomationStudioInstructedRead>; usage: AutomationStudioInstructionAuthorityUsage } {
  const usage: AutomationStudioInstructionAuthorityUsage = { calls: 0, estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
  // The text the service reads the checklist from (`../service.ts`, `bootstrapInstructionText`), so an act's id here is its id there.
  const acts = automationStudioInstructedActs(input.active.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n")).map((act) => ({ id: act.id, quote: act.quote, ...(act.source ? { source: act.source } : {}) }));
  const completionSchema = automationStudioInstructedConsequencesSchema(acts);
  const decisionSchema: JsonObject = { description: READ_DECISION, ...buildAutomationStudioLlmEvidenceLoopDecisionSchema([], completionSchema, true) };
  const derive = async (): Promise<AutomationStudioInstructedRead> => {
    const answer = await input.run({
      taskKind: "evidence_tool_decision",
      projectId: input.projectId,
      flowId: input.flowId,
      instructions: input.instructions,
      evidenceLoop: { iteration: 1, tools: [], evidence: [], decisionSchema, completionSchema, canComplete: true },
      provider: input.provider.provider,
      ...(input.provider.tokenLimits ? { tokenLimits: input.provider.tokenLimits } : {}),
      ...(input.provider.timeoutMs !== undefined ? { timeoutMs: input.provider.timeoutMs } : {}),
      ...(input.maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd: input.maxEstimatedCostUsd } : {}),
      expectedOutput: "evidence_tool_decision",
      metadata: { source: "instructionAuthority" }
    });
    usage.calls += 1;
    usage.estimatedInputTokens += answer.request.estimatedInputTokens;
    usage.inputTokens += answer.usage?.inputTokens ?? 0;
    usage.outputTokens += answer.usage?.outputTokens ?? 0;
    usage.totalTokens += answer.usage?.totalTokens ?? 0;
    usage.estimatedCostUsd += answer.usage?.estimatedCostUsd ?? 0;
    const decision = answer.ok && answer.response?.kind === "evidence_tool_decision" ? answer.response.decision : undefined;
    if (decision?.kind !== "complete") return automationStudioInstructedReadUnanswered(acts);
    return readAutomationStudioInstructedRead({ result: decision.result, instructions: input.active, acts });
  };
  return { derive, usage };
}
