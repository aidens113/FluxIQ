import type { PolicyGraph } from "../index.ts";
import { validateConditionExpression } from "./condition.ts";
import { addIssue, result, type AutomationStudioValidationIssue, type AutomationStudioValidationResult } from "./issue.ts";

export function validatePolicyGraph(policy: PolicyGraph): AutomationStudioValidationResult {
  const issues: AutomationStudioValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  for (const [index, node] of policy.nodes.entries()) {
    const path = `nodes.${index}`;
    if (nodeIds.has(node.id)) {
      addIssue(issues, "error", "policy.duplicate_node_id", `Duplicate policy node id "${node.id}".`, `${path}.id`);
    }
    nodeIds.add(node.id);
    if (node.actions.length === 0) {
      addIssue(issues, "warning", "policy.node_without_actions", `Policy node "${node.id}" has no actions.`, `${path}.actions`);
    }
    if (node.timeout.timeoutMs <= 0) {
      addIssue(issues, "error", "policy.invalid_timeout", "Node timeoutMs must be greater than zero.", `${path}.timeout.timeoutMs`);
    }
    if (node.retry.maxAttempts < 0) {
      addIssue(issues, "error", "policy.invalid_retry", "Node retry maxAttempts must be zero or greater.", `${path}.retry.maxAttempts`);
    }
    validateConditionExpression(node.eligibility, issues, `${path}.eligibility`);
    validateConditionExpression(node.successConditions, issues, `${path}.successConditions`);
    if (node.readinessConditions) validateConditionExpression(node.readinessConditions, issues, `${path}.readinessConditions`);
    if (node.failureConditions) validateConditionExpression(node.failureConditions, issues, `${path}.failureConditions`);
    if (node.invariants) validateConditionExpression(node.invariants, issues, `${path}.invariants`);
  }

  for (const [index, edge] of policy.edges.entries()) {
    const path = `edges.${index}`;
    if (edgeIds.has(edge.id)) {
      addIssue(issues, "error", "policy.duplicate_edge_id", `Duplicate policy edge id "${edge.id}".`, `${path}.id`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.fromNodeId)) {
      addIssue(issues, "error", "policy.edge_missing_from_node", `Policy edge references missing fromNodeId "${edge.fromNodeId}".`, `${path}.fromNodeId`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      addIssue(issues, "error", "policy.edge_missing_to_node", `Policy edge references missing toNodeId "${edge.toNodeId}".`, `${path}.toNodeId`);
    }
    if (edge.probability !== undefined && (edge.probability < 0 || edge.probability > 1)) {
      addIssue(issues, "error", "policy.invalid_edge_probability", "Policy edge probability must be between 0 and 1.", `${path}.probability`);
    }
    if (edge.condition) validateConditionExpression(edge.condition, issues, `${path}.condition`);
  }

  for (const [nodeIndex, node] of policy.nodes.entries()) {
    for (const [edgeIndex, edge] of node.outgoingEdges.entries()) {
      const path = `nodes.${nodeIndex}.outgoingEdges.${edgeIndex}`;
      if (edge.fromNodeId !== node.id) {
        addIssue(issues, "error", "policy.node_edge_from_mismatch", "Node outgoing edge fromNodeId must match the owning node.", `${path}.fromNodeId`);
      }
      if (!nodeIds.has(edge.toNodeId)) {
        addIssue(issues, "error", "policy.node_edge_missing_to_node", `Node outgoing edge references missing toNodeId "${edge.toNodeId}".`, `${path}.toNodeId`);
      }
    }
  }

  return result(issues);
}
