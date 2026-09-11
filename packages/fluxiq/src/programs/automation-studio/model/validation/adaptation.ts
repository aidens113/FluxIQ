import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation, AutomationStudioFlowChangeProposal, AutomationStudioFlowInstruction, AutomationStudioFlowRouter, AutomationStudioFlowSubflow } from "../index.ts";
import { validateConditionExpression } from "./condition.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";

export function validateAutomationStudioFlowRouter(router: AutomationStudioFlowRouter, subflows: AutomationStudioFlowSubflow[] = []): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const subflowIds = new Set(subflows.map((subflow) => subflow.subflowId));
  if (!router.routerId.trim()) addIssue(issues, "error", "router.missing_id", "Router must have a routerId.", "routerId");
  if (!router.flowId.trim()) addIssue(issues, "error", "router.missing_flow_id", "Router must have a flowId.", "flowId");
  if (!router.projectId.trim()) addIssue(issues, "error", "router.missing_project_id", "Router must have a projectId.", "projectId");
  if (!router.name.trim()) addIssue(issues, "error", "router.missing_name", "Router must have a name.", "name");
  if (router.updatedAt < router.createdAt) addIssue(issues, "error", "router.updated_before_created", "Router updatedAt must be greater than or equal to createdAt.", "updatedAt");
  const ruleIds = new Set<string>();
  const orders = new Set<number>();
  for (const [index, rule] of router.rules.entries()) {
    const path = `rules.${index}`;
    if (!rule.ruleId.trim()) addIssue(issues, "error", "router.rule_missing_id", "Route rule must have a ruleId.", `${path}.ruleId`);
    if (rule.routerId !== router.routerId) addIssue(issues, "error", "router.rule_router_mismatch", "Route rule routerId must match the parent router.", `${path}.routerId`);
    if (!rule.name.trim()) addIssue(issues, "error", "router.rule_missing_name", "Route rule must have a name.", `${path}.name`);
    if (ruleIds.has(rule.ruleId)) addIssue(issues, "error", "router.duplicate_rule_id", `Duplicate route rule id "${rule.ruleId}".`, `${path}.ruleId`);
    ruleIds.add(rule.ruleId);
    if (!Number.isInteger(rule.order) || rule.order < 0) addIssue(issues, "error", "router.rule_invalid_order", "Route rule order must be a non-negative integer.", `${path}.order`);
    if (orders.has(rule.order)) addIssue(issues, "warning", "router.duplicate_rule_order", `Route rule order ${rule.order} is duplicated.`, `${path}.order`);
    orders.add(rule.order);
    if (!rule.target.subflowId.trim()) addIssue(issues, "error", "router.rule_missing_target", "Route rule target must include a subflowId.", `${path}.target.subflowId`);
    if (subflows.length && !subflowIds.has(rule.target.subflowId)) addIssue(issues, "error", "router.rule_unknown_subflow", `Route rule targets unknown subflow "${rule.target.subflowId}".`, `${path}.target.subflowId`);
    if (rule.confidence !== undefined && (rule.confidence < 0 || rule.confidence > 1)) addIssue(issues, "error", "router.rule_invalid_confidence", "Route rule confidence must be between 0 and 1.", `${path}.confidence`);
    if (rule.updatedAt < rule.createdAt) addIssue(issues, "error", "router.rule_updated_before_created", "Route rule updatedAt must be greater than or equal to createdAt.", `${path}.updatedAt`);
    if (rule.condition) validateConditionExpression(rule.condition, issues, `${path}.condition`);
  }
  if (router.fallback?.kind === "subflow") {
    if (!router.fallback.subflowId.trim()) addIssue(issues, "error", "router.fallback_missing_target", "Router fallback subflow target must include a subflowId.", "fallback.subflowId");
    if (subflows.length && !subflowIds.has(router.fallback.subflowId)) addIssue(issues, "error", "router.fallback_unknown_subflow", `Router fallback targets unknown subflow "${router.fallback.subflowId}".`, "fallback.subflowId");
  }
  return result(issues);
}

export function validateAutomationStudioFlowSubflow(subflow: AutomationStudioFlowSubflow): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!subflow.subflowId.trim()) addIssue(issues, "error", "subflow.missing_id", "Subflow must have a subflowId.", "subflowId");
  if (!subflow.flowId.trim()) addIssue(issues, "error", "subflow.missing_flow_id", "Subflow must have a flowId.", "flowId");
  if (!subflow.projectId.trim()) addIssue(issues, "error", "subflow.missing_project_id", "Subflow must have a projectId.", "projectId");
  if (!subflow.name.trim()) addIssue(issues, "error", "subflow.missing_name", "Subflow must have a name.", "name");
  if (subflow.updatedAt < subflow.createdAt) addIssue(issues, "error", "subflow.updated_before_created", "Subflow updatedAt must be greater than or equal to createdAt.", "updatedAt");
  if (subflow.tags?.some((tag) => !tag.trim())) addIssue(issues, "error", "subflow.empty_tag", "Subflow tags cannot be empty.", "tags");
  if (subflow.routeTags?.some((tag) => !tag.trim())) addIssue(issues, "error", "subflow.empty_route_tag", "Subflow route tags cannot be empty.", "routeTags");
  if (subflow.localInstructionIds?.some((id) => !id.trim())) addIssue(issues, "error", "subflow.empty_instruction_id", "Subflow instruction IDs cannot be empty.", "localInstructionIds");
  if (subflow.graphFlowId !== undefined && !subflow.graphFlowId.trim()) addIssue(issues, "error", "subflow.empty_graph_flow_id", "Subflow graphFlowId cannot be empty when provided.", "graphFlowId");
  validateSubflowMapping(subflow.inputMapping ?? [], "inputMapping", "flowInputId", "subflowInputId", issues);
  validateSubflowMapping(subflow.outputMapping ?? [], "outputMapping", "subflowOutputId", "flowOutputId", issues);
  if (subflow.stability) {
    const stability = subflow.stability;
    if (stability.runCount < 0 || stability.successCount < 0 || stability.failureCount < 0) addIssue(issues, "error", "subflow.invalid_stability_counts", "Subflow stability counts cannot be negative.", "stability");
    if (stability.successCount + stability.failureCount > stability.runCount) addIssue(issues, "error", "subflow.invalid_stability_total", "Subflow success and failure counts cannot exceed run count.", "stability");
    if (stability.lastFailureAt !== undefined && stability.lastRunAt !== undefined && stability.lastFailureAt > stability.lastRunAt) addIssue(issues, "error", "subflow.failure_after_last_run", "Subflow lastFailureAt cannot be after lastRunAt.", "stability.lastFailureAt");
  }
  return result(issues);
}

function validateSubflowMapping<TLeft extends string, TRight extends string>(
  mappings: Array<Record<TLeft | TRight, string>>,
  path: string,
  leftKey: TLeft,
  rightKey: TRight,
  issues: AutomationStudioValidationIssue[]
): void {
  const leftIds = new Set<string>();
  const rightIds = new Set<string>();
  for (const [index, mapping] of mappings.entries()) {
    const left = mapping[leftKey];
    const right = mapping[rightKey];
    if (!left.trim() || !right.trim()) addIssue(issues, "error", "subflow.empty_mapping_id", "Subflow mapping IDs cannot be empty.", `${path}.${index}`);
    if (leftIds.has(left)) addIssue(issues, "error", "subflow.duplicate_mapping_source", "Subflow mapping source IDs must be unique.", `${path}.${index}.${leftKey}`);
    if (rightIds.has(right)) addIssue(issues, "error", "subflow.duplicate_mapping_target", "Subflow mapping target IDs must be unique.", `${path}.${index}.${rightKey}`);
    leftIds.add(left);
    rightIds.add(right);
  }
}

export function validateAutomationStudioFlowInstruction(instruction: AutomationStudioFlowInstruction): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!instruction.instructionId.trim()) addIssue(issues, "error", "instruction.missing_id", "Instruction must have an instructionId.", "instructionId");
  if (!instruction.title.trim()) addIssue(issues, "error", "instruction.missing_title", "Instruction must have a title.", "title");
  if (!instruction.body.trim()) addIssue(issues, "error", "instruction.missing_body", "Instruction must have a body.", "body");
  if (!Number.isFinite(instruction.priority)) addIssue(issues, "error", "instruction.invalid_priority", "Instruction priority must be finite.", "priority");
  if (instruction.updatedAt < instruction.createdAt) addIssue(issues, "error", "instruction.updated_before_created", "Instruction updatedAt must be greater than or equal to createdAt.", "updatedAt");
  validateInstructionScope(instruction.scope, issues, "scope");
  for (const [index, id] of (instruction.linkedRunIds ?? []).entries()) if (!id.trim()) addIssue(issues, "error", "instruction.empty_linked_run", "Linked run IDs cannot be empty.", `linkedRunIds.${index}`);
  for (const [index, id] of (instruction.linkedAdaptationIds ?? []).entries()) if (!id.trim()) addIssue(issues, "error", "instruction.empty_linked_adaptation", "Linked adaptation IDs cannot be empty.", `linkedAdaptationIds.${index}`);
  for (const [index, id] of (instruction.linkedRecordingIds ?? []).entries()) if (!id.trim()) addIssue(issues, "error", "instruction.empty_linked_recording", "Linked recording IDs cannot be empty.", `linkedRecordingIds.${index}`);
  for (const [index, id] of (instruction.linkedSubflowIds ?? []).entries()) if (!id.trim()) addIssue(issues, "error", "instruction.empty_linked_subflow", "Linked subflow IDs cannot be empty.", `linkedSubflowIds.${index}`);
  return result(issues);
}

export function validateAutomationStudioFlowChangeProposal(proposal: AutomationStudioFlowChangeProposal): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!proposal.proposalId.trim()) addIssue(issues, "error", "change_proposal.missing_id", "Change proposal must have a proposalId.", "proposalId");
  if (!proposal.flowId.trim()) addIssue(issues, "error", "change_proposal.missing_flow_id", "Change proposal must have a flowId.", "flowId");
  if (!proposal.projectId.trim()) addIssue(issues, "error", "change_proposal.missing_project_id", "Change proposal must have a projectId.", "projectId");
  if (!proposal.patches.length) addIssue(issues, "error", "change_proposal.missing_patches", "Change proposal must include at least one patch.", "patches");
  if (proposal.updatedAt < proposal.createdAt) addIssue(issues, "error", "change_proposal.updated_before_created", "Change proposal updatedAt must be greater than or equal to createdAt.", "updatedAt");
  for (const [index, patch] of proposal.patches.entries()) {
    const path = `patches.${index}`;
    if (!patch.summary.trim()) addIssue(issues, "error", "change_proposal.patch_missing_summary", "Change proposal patch must include a summary.", `${path}.summary`);
    if (patch.targetId !== undefined && !patch.targetId.trim()) addIssue(issues, "error", "change_proposal.patch_empty_target", "Change proposal patch targetId cannot be empty when provided.", `${path}.targetId`);
  }
  return result(issues);
}

export function validateAutomationStudioFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!adaptation.adaptationId.trim()) addIssue(issues, "error", "adaptation.missing_id", "Adaptation must have an adaptationId.", "adaptationId");
  if (!adaptation.flowId.trim()) addIssue(issues, "error", "adaptation.missing_flow_id", "Adaptation must have a flowId.", "flowId");
  if (!adaptation.projectId.trim()) addIssue(issues, "error", "adaptation.missing_project_id", "Adaptation must have a projectId.", "projectId");
  if (!adaptation.trigger.trim()) addIssue(issues, "error", "adaptation.missing_trigger", "Adaptation must describe its trigger.", "trigger");
  if (!adaptation.patch.length) addIssue(issues, "error", "adaptation.missing_patch", "Adaptation must include at least one patch.", "patch");
  if (adaptation.updatedAt < adaptation.createdAt) addIssue(issues, "error", "adaptation.updated_before_created", "Adaptation updatedAt must be greater than or equal to createdAt.", "updatedAt");
  for (const [index, result] of (adaptation.validationResults ?? []).entries()) {
    if (!result.runId.trim()) addIssue(issues, "error", "adaptation.validation_missing_run", "Adaptation validation result must include a runId.", `validationResults.${index}.runId`);
    if (result.checkedAt < adaptation.createdAt) addIssue(issues, "warning", "adaptation.validation_before_created", "Adaptation validation was recorded before the adaptation was created.", `validationResults.${index}.checkedAt`);
  }
  return result(issues);
}

export function validateAutomationStudioAdaptationPolicy(policy: AutomationStudioAdaptationPolicy): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  if (!policy.policyId.trim()) addIssue(issues, "error", "adaptation_policy.missing_id", "Adaptation policy must have a policyId.", "policyId");
  if (!policy.scope.flowId.trim()) addIssue(issues, "error", "adaptation_policy.missing_flow_id", "Adaptation policy scope must include a flowId.", "scope.flowId");
  if (policy.scope.kind === "subflow" && !policy.scope.subflowId.trim()) addIssue(issues, "error", "adaptation_policy.missing_subflow_id", "Subflow adaptation policy scope must include a subflowId.", "scope.subflowId");
  if (policy.updatedAt < policy.createdAt) addIssue(issues, "error", "adaptation_policy.updated_before_created", "Adaptation policy updatedAt must be greater than or equal to createdAt.", "updatedAt");
  if (policy.preset === "locked" && [
    policy.allowRuntimeRecovery,
    policy.allowCreateRecoveryPaths,
    policy.allowModifySubflows,
    policy.allowCreateSubflows,
    policy.allowModifyRouter,
    policy.allowModifyExpectations,
    policy.allowModifyActionTargets,
    policy.allowDeleteOrDisableBehavior,
    policy.allowExternalSideEffects
  ].some(Boolean)) {
    addIssue(issues, "error", "adaptation_policy.locked_allows_changes", "Locked adaptation policy cannot allow runtime recovery or modifications.", "preset");
  }
  if (policy.allowDeleteOrDisableBehavior && !policy.requireApprovalForDestructiveChanges) {
    addIssue(issues, "error", "adaptation_policy.destructive_without_approval", "Destructive behavior changes require approval.", "requireApprovalForDestructiveChanges");
  }
  if (policy.allowExternalSideEffects && !policy.requireApprovalForExternalSideEffects) {
    addIssue(issues, "error", "adaptation_policy.side_effects_without_approval", "External side effects require approval.", "requireApprovalForExternalSideEffects");
  }
  if (policy.maxInterventionsPerRun !== undefined && (!Number.isInteger(policy.maxInterventionsPerRun) || policy.maxInterventionsPerRun < 0)) {
    addIssue(issues, "error", "adaptation_policy.invalid_intervention_limit", "maxInterventionsPerRun must be a non-negative integer.", "maxInterventionsPerRun");
  }
  if (policy.maxEstimatedCostUsdPerRun !== undefined && policy.maxEstimatedCostUsdPerRun < 0) {
    addIssue(issues, "error", "adaptation_policy.invalid_cost_limit", "maxEstimatedCostUsdPerRun cannot be negative.", "maxEstimatedCostUsdPerRun");
  }
  return result(issues);
}

function validateInstructionScope(scope: AutomationStudioFlowInstruction["scope"], issues: AutomationStudioValidationIssue[], path: string): void {
  if (scope.kind === "project" && !scope.projectId.trim()) addIssue(issues, "error", "instruction.scope_missing_project", "Project-scoped instruction must include a projectId.", `${path}.projectId`);
  if (scope.kind === "flow") {
    if (!scope.projectId.trim()) addIssue(issues, "error", "instruction.scope_missing_project", "Flow-scoped instruction must include a projectId.", `${path}.projectId`);
    if (!scope.flowId.trim()) addIssue(issues, "error", "instruction.scope_missing_flow", "Flow-scoped instruction must include a flowId.", `${path}.flowId`);
  }
  if (scope.kind === "router") {
    if (!scope.projectId.trim()) addIssue(issues, "error", "instruction.scope_missing_project", "Router-scoped instruction must include a projectId.", `${path}.projectId`);
    if (!scope.flowId.trim()) addIssue(issues, "error", "instruction.scope_missing_flow", "Router-scoped instruction must include a flowId.", `${path}.flowId`);
    if (!scope.routerId.trim()) addIssue(issues, "error", "instruction.scope_missing_router", "Router-scoped instruction must include a routerId.", `${path}.routerId`);
  }
  if (scope.kind === "subflow") {
    if (!scope.projectId.trim()) addIssue(issues, "error", "instruction.scope_missing_project", "Subflow-scoped instruction must include a projectId.", `${path}.projectId`);
    if (!scope.flowId.trim()) addIssue(issues, "error", "instruction.scope_missing_flow", "Subflow-scoped instruction must include a flowId.", `${path}.flowId`);
    if (!scope.subflowId.trim()) addIssue(issues, "error", "instruction.scope_missing_subflow", "Subflow-scoped instruction must include a subflowId.", `${path}.subflowId`);
  }
  if (scope.kind === "node") {
    if (!scope.projectId.trim()) addIssue(issues, "error", "instruction.scope_missing_project", "Node-scoped instruction must include a projectId.", `${path}.projectId`);
    if (!scope.flowId.trim()) addIssue(issues, "error", "instruction.scope_missing_flow", "Node-scoped instruction must include a flowId.", `${path}.flowId`);
    if (!scope.nodeId.trim()) addIssue(issues, "error", "instruction.scope_missing_node", "Node-scoped instruction must include a nodeId.", `${path}.nodeId`);
    if (scope.subflowId !== undefined && !scope.subflowId.trim()) addIssue(issues, "error", "instruction.scope_empty_subflow", "Node-scoped instruction subflowId cannot be empty when provided.", `${path}.subflowId`);
  }
  if (scope.kind === "on_error" || scope.kind === "adaptation_review") {
    if (!scope.projectId.trim()) addIssue(issues, "error", "instruction.scope_missing_project", "Scoped instruction must include a projectId.", `${path}.projectId`);
    if (!scope.flowId.trim()) addIssue(issues, "error", "instruction.scope_missing_flow", "Scoped instruction must include a flowId.", `${path}.flowId`);
    if (scope.subflowId !== undefined && !scope.subflowId.trim()) addIssue(issues, "error", "instruction.scope_empty_subflow", "Scoped instruction subflowId cannot be empty when provided.", `${path}.subflowId`);
  }
  if (scope.kind === "on_error" && scope.nodeId !== undefined && !scope.nodeId.trim()) addIssue(issues, "error", "instruction.scope_empty_node", "On-error instruction nodeId cannot be empty when provided.", `${path}.nodeId`);
}
