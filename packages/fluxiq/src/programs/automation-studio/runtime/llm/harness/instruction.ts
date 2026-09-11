import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import { estimateTokens } from "./token-limits.ts";

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

export function resolveAutomationStudioLlmInstructions(input: AutomationStudioInstructionResolutionInput): AutomationStudioInstructionResolution {
  const tokenBudget = Math.max(128, Math.trunc(input.tokenBudget ?? 2_000));
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
  const resolved: AutomationStudioResolvedInstruction[] = [];
  let estimatedTokens = 0;
  for (const instruction of scoped) {
    const baseTokens = estimateTokens(instruction.body) + estimateTokens(instruction.title);
    const remaining = tokenBudget - estimatedTokens;
    if (remaining <= 0) break;
    const truncated = baseTokens > remaining;
    const body = truncated ? truncateToEstimatedTokens(instruction.body, Math.max(24, remaining - estimateTokens(instruction.title))) : instruction.body;
    estimatedTokens += Math.min(baseTokens, remaining);
    resolved.push({
      instructionId: instruction.instructionId,
      scopeKind: instruction.scope.kind,
      title: instruction.title,
      body,
      priority: instruction.priority,
      requirement: instruction.requirement,
      tags: instruction.tags ?? [],
      ...(truncated ? { truncated: true } : {})
    });
    if (truncated) diagnostics.push({ severity: "warning", code: "instruction.truncated", message: `Instruction ${instruction.instructionId} was truncated to fit context budget.`, path: instruction.instructionId });
  }
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

function truncateToEstimatedTokens(value: string, tokens: number): string {
  return `${value.slice(0, Math.max(0, tokens * 4)).trimEnd()}...`;
}
