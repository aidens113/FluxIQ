import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, estimateTokens } from "./token-limits.ts";

export type AutomationStudioResolvedInstruction = {
  instructionId: string;
  scopeKind: string;
  title: string;
  body: string;
  priority: number;
  requirement: "advisory" | "required";
  tags: string[];
  truncated?: boolean;
};

export type AutomationStudioInstructionResolution = {
  instructions: AutomationStudioResolvedInstruction[];
  instructionIds: string[];
  diagnostics: AutomationStudioLlmDiagnostic[];
  tokenBudget: number;
  estimatedTokens: number;
};

export type AutomationStudioInstructionResolutionInput = {
  instructions: AutomationStudioFlowInstruction[];
  projectId: string;
  flowId: string;
  routerId?: string;
  subflowId?: string;
  nodeId?: string;
  onError?: boolean;
  review?: boolean;
  tokenBudget?: number;
};

/**
 * The effective instructions for one call.
 *
 * `stageInstructions` are the loop's stage protocol: Core's ordering statement
 * and the current stage's instructions, already composed by
 * `automationStudioLoopStageInstructions`. They arrive as a separate parameter
 * rather than as a field of the input so that nothing can put stage prose into
 * a request without going through the composer that always emits the ordering
 * statement first.
 *
 * They come ahead of the Flow's own instructions, and every instruction is
 * carried whole (user, 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
 * ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION"). Until then instructions
 * were cut to a token budget -- 384 tokens for a flow bootstrap, 2,000 by
 * default and 4,000 for a repair build -- which could cut the person's own
 * request. `tokenBudget` is now only the request's input limit, reported beside
 * `estimatedTokens`; a request over the model's window is refused whole before
 * it is sent (`./run.ts`), never trimmed here.
 */
export function resolveAutomationStudioLlmInstructions(
  input: AutomationStudioInstructionResolutionInput,
  stageInstructions: readonly AutomationStudioResolvedInstruction[] = []
): AutomationStudioInstructionResolution {
  const tokenBudget = Math.trunc(input.tokenBudget ?? AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST);
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  const scoped = input.instructions
    .filter((instruction) => instruction.status === "active")
    .filter((instruction) => instructionAppliesToLlmContext(instruction, input))
    .sort(compareInstructionsForLlm);
  const requiredByScope = new Map<string, AutomationStudioFlowInstruction[]>();
  for (const instruction of scoped.filter((item) => item.requirement === "required")) {
    const key = instruction.scope.kind;
    requiredByScope.set(key, [...(requiredByScope.get(key) ?? []), instruction]);
  }
  for (const [scopeKind, items] of requiredByScope) {
    const always = items.filter((item) => /\balways\b/i.test(item.body));
    const never = items.filter((item) => /\bnever\b/i.test(item.body));
    if (always.length && never.length) diagnostics.push({ severity: "error", code: "instruction.conflict", message: `Required ${scopeKind} instructions contain both always and never directives.`, path: scopeKind });
  }
  const candidates: AutomationStudioResolvedInstruction[] = [
    ...stageInstructions,
    ...scoped.map((instruction) => ({
      instructionId: instruction.instructionId,
      scopeKind: instruction.scope.kind,
      title: instruction.title,
      body: instruction.body,
      priority: instruction.priority,
      requirement: instruction.requirement,
      tags: instruction.tags ?? []
    }))
  ];
  const resolved: AutomationStudioResolvedInstruction[] = candidates.map((instruction) => ({ ...instruction }));
  const estimatedTokens = resolved.reduce((sum, instruction) => sum + estimateTokens(instruction.body) + estimateTokens(instruction.title), 0);
  return {
    instructions: resolved,
    instructionIds: resolved.map((instruction) => instruction.instructionId),
    diagnostics,
    tokenBudget,
    estimatedTokens
  };
}

function instructionAppliesToLlmContext(instruction: AutomationStudioFlowInstruction, input: AutomationStudioInstructionResolutionInput): boolean {
  const scope = instruction.scope;
  if (scope.kind === "global") return true;
  if (scope.kind === "project") return scope.projectId === input.projectId;
  if (scope.kind === "flow") return scope.projectId === input.projectId && scope.flowId === input.flowId;
  if (scope.kind === "router") return scope.projectId === input.projectId && scope.flowId === input.flowId && (!input.routerId || scope.routerId === input.routerId);
  if (scope.kind === "subflow") return scope.projectId === input.projectId && scope.flowId === input.flowId && (!input.subflowId || scope.subflowId === input.subflowId);
  if (scope.kind === "node") return scope.projectId === input.projectId && scope.flowId === input.flowId && (!input.nodeId || scope.nodeId === input.nodeId) && (!scope.subflowId || scope.subflowId === input.subflowId);
  if (scope.kind === "on_error") return input.onError === true && scope.projectId === input.projectId && scope.flowId === input.flowId && (!scope.subflowId || scope.subflowId === input.subflowId) && (!scope.nodeId || scope.nodeId === input.nodeId);
  if (scope.kind === "adaptation_review") return input.review === true && scope.projectId === input.projectId && scope.flowId === input.flowId && (!scope.subflowId || scope.subflowId === input.subflowId);
  return false;
}

function compareInstructionsForLlm(left: AutomationStudioFlowInstruction, right: AutomationStudioFlowInstruction): number {
  return scopeRank(left.scope.kind) - scopeRank(right.scope.kind)
    || right.priority - left.priority
    || left.updatedAt - right.updatedAt
    || left.instructionId.localeCompare(right.instructionId);
}

function scopeRank(scopeKind: string): number {
  return ["global", "project", "flow", "router", "subflow", "node", "on_error", "adaptation_review"].indexOf(scopeKind);
}
