import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceLoopWrapUp, type AutomationStudioLlmEvidenceLoopRemaining } from "../loop-budget.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import type { AutomationStudioLlmRunNodesAllowance } from "../node-reruns/index.ts";
import type { AutomationStudioLlmRerunRecord } from "../rerun-provenance/index.ts";
import type { AutomationStudioLlmEvidenceLoopPurse, AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import type { automationStudioLlmEvidenceToolAdmission } from "./tool-admission.ts";

/** Re-read ordinary offering and hard bounds immediately before every actual member. */
export function automationStudioLlmPriorNodesAdmission(input: {
  config: AutomationStudioLlmEvidenceLoopInput;
  maxToolCalls: number;
  accounting: { toolCalls: number };
  failedCalls(): number;
  minToolCalls: number;
  purse: AutomationStudioLlmEvidenceLoopPurse;
  clock(): number;
  startedAtMs: number;
  stopped(): boolean;
  remaining(): AutomationStudioLlmEvidenceLoopRemaining | undefined;
  eligible(): AutomationStudioLlmEvidenceTool[];
  admission(decision: { toolId: string; input: JsonObject }, context: { eligibleToolIds: ReadonlySet<string>; offered: readonly AutomationStudioLlmEvidenceTool[]; withholds(toolId: string, value: JsonObject): boolean }, options: { priorSuccessful: true }): ReturnType<typeof automationStudioLlmEvidenceToolAdmission>;
}) {
  function allowance(): AutomationStudioLlmRunNodesAllowance {
    if (input.config.signal?.aborted) return { allowed: false, reason: "cancelled" };
    if (input.accounting.toolCalls >= input.maxToolCalls) return { allowed: false, reason: "tool_calls" };
    if (input.config.budget?.maxDurationMs !== undefined && input.clock() - input.startedAtMs >= input.config.budget.maxDurationMs) return { allowed: false, reason: "time" };
    if (input.config.purse?.isClosed() || input.purse.refusal) return { allowed: false, reason: "purse" };
    const figures = input.purse.figures();
    if (figures && (figures.spentUsd + figures.pendingUsd + figures.keptBackUsd >= figures.ceilingUsd || (figures.callsLeft !== undefined && figures.callsLeft <= (input.config.budget?.countCalls?.keptForFinishing ?? 0)))) return { allowed: false, reason: "purse" };
    if (input.stopped()) return { allowed: false, reason: "unavailable" };
    return { allowed: true };
  }
  return {
    allowance,
    read(record: AutomationStudioLlmRerunRecord) {
      const eligible = input.eligible();
      const wrapped = automationStudioLlmEvidenceLoopWrapUp({ remaining: input.remaining(), canComplete: input.accounting.toolCalls - input.failedCalls() >= input.minToolCalls, candidate: input.config.discoveryOnly === true, tools: eligible, finishing: input.config.finishingTools });
      const context = { eligibleToolIds: new Set(eligible.map((tool) => tool.toolId)), offered: wrapped.offered, withholds: wrapped.withholds };
      const original = { toolId: record.toolId, input: record.originalValue };
      const read = input.admission(original, context, { priorSuccessful: true });
      const canonical = input.admission({ ...original, input: { ...record.originalValue, node: record.definitionId } }, context, { priorSuccessful: true });
      return { read, allowed: read.tool !== undefined && !read.withdrawn && !read.deadline && !read.final && !read.triedHere && !read.answered && !canonical.withdrawn && !canonical.triedHere && !canonical.answered && canonical.nodeOffered !== false };
    }
  };
}
