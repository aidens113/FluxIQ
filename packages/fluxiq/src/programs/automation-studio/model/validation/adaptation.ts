import type { AutomationStudioAdaptationPolicy, AutomationStudioDeterministicPath, AutomationStudioDeterministicPathNode, AutomationStudioFlowAdaptation, AutomationStudioFlowChangeOrigin, AutomationStudioFlowChangeProposal, AutomationStudioFlowInstruction, AutomationStudioFlowRouter, AutomationStudioFlowSubflow } from "../index.ts";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { validateConditionExpression } from "./condition.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";

const VALIDATION_RESULT_STATUSES: ReadonlySet<unknown> = new Set(["succeeded", "failed"]);
const VALIDATION_RESULT_KINDS: ReadonlySet<unknown> = new Set(["trial", "replay"]);
/** A basis entry is a check code, never prose or page text. */
const VALIDATION_BASIS_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const VALIDATION_BASIS_MAX_ENTRIES = 16;
const ORIGIN_ID_MAX_LENGTH = 256;
const ORIGIN_SIGNATURE_MAX_LENGTH = 512;
const ORIGIN_MAX_INSTRUCTION_IDS = 64;
/** How many nodes one deterministic recovery path may insert. */
const DETERMINISTIC_PATH_MAX_NODES = 16;
const DETERMINISTIC_PATH_ID_MAX_LENGTH = 256;
const DETERMINISTIC_PATH_LABEL_MAX_LENGTH = 200;
const DETERMINISTIC_PATH_NODE_KEYS = ["nodeId", "definitionId", "definitionVersion", "label", "parameters", "target", "expectation"];
const DETERMINISTIC_PATH_KEYS = ["nodes", "returnToNodeId"];

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
    const path = `validationResults.${index}`;
    if (!result.runId.trim()) addIssue(issues, "error", "adaptation.validation_missing_run", "Adaptation validation result must include a runId.", `${path}.runId`);
    if (result.checkedAt < adaptation.createdAt) addIssue(issues, "warning", "adaptation.validation_before_created", "Adaptation validation was recorded before the adaptation was created.", `${path}.checkedAt`);
    if (!VALIDATION_RESULT_STATUSES.has(result.status)) addIssue(issues, "error", "adaptation.validation_invalid_status", "Adaptation validation status must be succeeded or failed.", `${path}.status`);
    // An absent kind is a result written before kinds existed, and reads as a trial.
    if (result.kind !== undefined && !VALIDATION_RESULT_KINDS.has(result.kind)) addIssue(issues, "error", "adaptation.validation_invalid_kind", "Adaptation validation kind must be trial or replay.", `${path}.kind`);
    if (result.basis !== undefined) {
      if (!isValidationBasis(result.basis)) addIssue(issues, "error", "adaptation.validation_invalid_basis", "Adaptation validation basis must list distinct check codes.", `${path}.basis`);
      else if (result.basis.length && result.status !== "succeeded") addIssue(issues, "error", "adaptation.validation_basis_without_success", "Only a succeeded adaptation validation can name a basis.", `${path}.basis`);
    }
  }
  // A deterministic path is checked here as well as where it is applied, so a
  // change that could never be wired is refused on the way into the store
  // rather than at the apply that a reviewer already approved.
  for (const [index, patch] of adaptation.patch.entries()) {
    if (patch.kind !== "insert_deterministic_path") continue;
    const path = `patch.${index}`;
    if (!patch.targetId?.trim()) addIssue(issues, "error", "adaptation.path_missing_target", "A deterministic path patch must name the node whose failure it recovers.", `${path}.targetId`);
    const parsed = parseAutomationStudioDeterministicPath(patch.after);
    if (!parsed) {
      addIssue(issues, "error", "adaptation.path_invalid", "A deterministic path patch must list the nodes to insert, each with a node id and a definition id.", `${path}.after`);
    }
  }
  const origin = adaptation.metadata?.origin;
  if (origin !== undefined) {
    const parsed = parseAutomationStudioFlowChangeOrigin(origin);
    if (!parsed) {
      addIssue(issues, "error", "adaptation.origin_invalid", "Adaptation metadata.origin must name one entry point and only its ids.", "metadata.origin");
    } else if (parsed.entryPoint !== "instruction" && parsed.runId !== undefined && adaptation.sourceRunId !== undefined && parsed.runId !== adaptation.sourceRunId) {
      addIssue(issues, "error", "adaptation.origin_run_mismatch", "Adaptation metadata.origin must name the adaptation's source run.", "metadata.origin.runId");
    }
  }
  return result(issues);
}

/**
 * Reads the `after` value of an `insert_deterministic_path` patch, or undefined
 * when it is not exactly that shape. Every field is checked and nothing else is
 * allowed, so an LLM response cannot smuggle page text or extra node fields
 * through into a graph write. Returns a fresh copy.
 *
 * A path must insert at least one node, because a patch that inserts none would
 * wire the failed node's `failed` port to nothing and report a repair that never
 * happened -- the defect this patch kind exists to end.
 */
export function parseAutomationStudioDeterministicPath(value: unknown): AutomationStudioDeterministicPath | undefined {
  if (!isRecord(value) || !hasOnlyKeys(Object.keys(value), DETERMINISTIC_PATH_KEYS)) return undefined;
  if (!Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > DETERMINISTIC_PATH_MAX_NODES) return undefined;
  const nodes: AutomationStudioDeterministicPathNode[] = [];
  for (const entry of value.nodes) {
    const node = parseDeterministicPathNode(entry);
    if (!node || nodes.some((existing) => existing.nodeId === node.nodeId)) return undefined;
    nodes.push(node);
  }
  const returnToNodeId = value.returnToNodeId;
  if (returnToNodeId !== undefined && !isOriginText(returnToNodeId, DETERMINISTIC_PATH_ID_MAX_LENGTH)) return undefined;
  // Rejoining an inserted node would make the path a loop with no exit.
  if (typeof returnToNodeId === "string" && nodes.some((node) => node.nodeId === returnToNodeId)) return undefined;
  return { nodes, ...(typeof returnToNodeId === "string" ? { returnToNodeId } : {}) };
}

function parseDeterministicPathNode(value: unknown): AutomationStudioDeterministicPathNode | undefined {
  if (!isRecord(value) || !hasOnlyKeys(Object.keys(value), DETERMINISTIC_PATH_NODE_KEYS)) return undefined;
  const { nodeId, definitionId, definitionVersion, label, parameters, target, expectation } = value;
  if (!isOriginText(nodeId, DETERMINISTIC_PATH_ID_MAX_LENGTH) || !isOriginText(definitionId, DETERMINISTIC_PATH_ID_MAX_LENGTH)) return undefined;
  if (definitionVersion !== undefined && !isOriginText(definitionVersion, DETERMINISTIC_PATH_ID_MAX_LENGTH)) return undefined;
  if (label !== undefined && !isOriginText(label, DETERMINISTIC_PATH_LABEL_MAX_LENGTH)) return undefined;
  if (parameters !== undefined && !isRecord(parameters)) return undefined;
  if (expectation !== undefined && !isRecord(expectation)) return undefined;
  if (target !== undefined && !isJsonValue(target)) return undefined;
  return {
    nodeId,
    definitionId,
    ...(typeof definitionVersion === "string" ? { definitionVersion } : {}),
    ...(typeof label === "string" ? { label } : {}),
    ...(parameters === undefined ? {} : { parameters: structuredClone(parameters) as JsonObject }),
    ...(target === undefined ? {} : { target: structuredClone(target) as JsonValue }),
    ...(expectation === undefined ? {} : { expectation: structuredClone(expectation) as JsonObject })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Whether a value survives the JSON round trip a graph write puts it through. */
function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

/**
 * Reads a stored change origin, or undefined when it is not exactly one of the
 * three shapes. Every field is checked and nothing else is allowed, so page
 * text cannot ride along. Returns a fresh copy.
 *
 * - `instruction`: at least one instruction id.
 * - `run_failure`: the run, the failed node and the failure signature.
 * - `edge_case`: instruction ids (possibly none), and a run when there are
 *   none; a failure signature only with its run.
 */
export function parseAutomationStudioFlowChangeOrigin(value: unknown): AutomationStudioFlowChangeOrigin | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record.entryPoint === "instruction") {
    if (!hasOnlyKeys(keys, ["entryPoint", "instructionIds"])) return undefined;
    const instructionIds = originIdList(record.instructionIds);
    return instructionIds?.length ? { entryPoint: "instruction", instructionIds } : undefined;
  }
  if (record.entryPoint === "run_failure") {
    if (!hasOnlyKeys(keys, ["entryPoint", "runId", "failedNodeId", "failureSignature"])) return undefined;
    const { runId, failedNodeId, failureSignature } = record;
    if (!isOriginText(runId, ORIGIN_ID_MAX_LENGTH) || !isOriginText(failedNodeId, ORIGIN_ID_MAX_LENGTH) || !isOriginText(failureSignature, ORIGIN_SIGNATURE_MAX_LENGTH)) return undefined;
    return { entryPoint: "run_failure", runId, failedNodeId, failureSignature };
  }
  if (record.entryPoint === "edge_case") {
    if (!hasOnlyKeys(keys, ["entryPoint", "instructionIds", "runId", "failureSignature"])) return undefined;
    const instructionIds = originIdList(record.instructionIds);
    const { runId, failureSignature } = record;
    if (!instructionIds) return undefined;
    if (runId !== undefined && !isOriginText(runId, ORIGIN_ID_MAX_LENGTH)) return undefined;
    if (failureSignature !== undefined && (runId === undefined || !isOriginText(failureSignature, ORIGIN_SIGNATURE_MAX_LENGTH))) return undefined;
    if (!instructionIds.length && runId === undefined) return undefined;
    return {
      entryPoint: "edge_case",
      instructionIds,
      ...(typeof runId === "string" ? { runId } : {}),
      ...(typeof failureSignature === "string" ? { failureSignature } : {})
    };
  }
  return undefined;
}

function isValidationBasis(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= VALIDATION_BASIS_MAX_ENTRIES
    && value.every((entry) => typeof entry === "string" && VALIDATION_BASIS_CODE.test(entry))
    && new Set(value).size === value.length;
}

function hasOnlyKeys(keys: string[], allowed: string[]): boolean {
  return keys.every((key) => allowed.includes(key));
}

function originIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > ORIGIN_MAX_INSTRUCTION_IDS) return undefined;
  if (!value.every((entry) => isOriginText(entry, ORIGIN_ID_MAX_LENGTH)) || new Set(value).size !== value.length) return undefined;
  return [...value] as string[];
}

// Non-empty, bounded, no surrounding whitespace, and no C0 control character or DEL.
function isOriginText(value: unknown, maxLength: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
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
