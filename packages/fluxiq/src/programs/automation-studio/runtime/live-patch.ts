import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowChangeProposal,
  AutomationStudioFlowDocument
} from "../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace, type AutomationStudioTransitionComparison } from "./executor.ts";
import type { AutomationStudioRuntimePatch } from "./llm-harness.ts";

export type AutomationStudioRuntimePatchPreflight = {
  ok: boolean;
  issues: string[];
  requiresExternalSideEffectApproval: boolean;
};

export type AutomationStudioRuntimePatchExecutionResult = {
  patch: AutomationStudioRuntimePatch;
  preflight: AutomationStudioRuntimePatchPreflight;
  trace?: AutomationStudioGraphExecutionTrace;
  restoredExpectedState: boolean;
  retryOriginalAction: boolean;
  adaptation?: AutomationStudioFlowAdaptation;
  changeProposal?: AutomationStudioFlowChangeProposal;
  metadata?: JsonObject;
};

export type AutomationStudioRuntimePatchExecutionInput = {
  projectId: string;
  flowId: string;
  runId: string;
  flow: AutomationStudioFlowDocument;
  patch: AutomationStudioRuntimePatch;
  failedAttempt: AutomationStudioNodeAttemptTrace;
  expectedComparison?: AutomationStudioTransitionComparison;
  policy?: AutomationStudioAdaptationPolicy;
  proposalMode?: "auto" | "manual" | "mixed";
  authorizedExternalSideEffects?: boolean;
  hostCapabilities?: Iterable<string>;
  options?: AutomationStudioGraphExecutionOptions;
  now?: () => number;
};

export function preflightAutomationStudioRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioRuntimePatchPreflight {
  const issues: string[] = [];
  const policy = input.policy;
  const sideEffecting = patchMayCauseExternalSideEffects(input.patch);
  if (policy && !policy.allowRuntimeRecovery) issues.push("Runtime recovery is disabled by adaptation policy.");
  if (sideEffecting && policy && !policy.allowExternalSideEffects) issues.push("External side effects are disabled by adaptation policy.");
  if (sideEffecting && policy?.requireApprovalForExternalSideEffects && input.authorizedExternalSideEffects !== true) issues.push("External side-effecting patch requires explicit authorization.");
  if (input.patch.kind === "temporary_recovery_subflow_call" && policy && !policy.allowCreateRecoveryPaths) issues.push("Recovery subflow calls are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_target_override" && policy && !policy.allowModifyActionTargets) issues.push("Action target overrides are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_reroute" && policy && !policy.allowModifyRouter) issues.push("Temporary reroutes are disabled by adaptation policy.");
  const suppliedHostCapabilities = input.hostCapabilities ?? input.options?.hostRuntime?.capabilities;
  if (suppliedHostCapabilities !== undefined) {
    const hostCapabilities = new Set(suppliedHostCapabilities);
    for (const capability of requiredHostCapabilitiesForRuntimePatch(input.patch)) {
      if (!hostCapabilities.has(capability)) issues.push(`Runtime patch requires host capability ${capability}.`);
    }
  }
  if (!runtimePatchTargetsFlow(input.flow, input.patch)) issues.push("Runtime patch points at a node or subflow that is not present in this Flow.");
  return {
    ok: issues.length === 0,
    issues,
    requiresExternalSideEffectApproval: sideEffecting && policy?.requireApprovalForExternalSideEffects === true
  };
}

export async function executeAutomationStudioRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput): Promise<AutomationStudioRuntimePatchExecutionResult> {
  const preflight = preflightAutomationStudioRuntimePatch(input);
  if (!preflight.ok) return { patch: input.patch, preflight, restoredExpectedState: false, retryOriginalAction: false };
  const patchedFlow = applyRuntimePatchToFlow(input.flow, input.patch);
  const startNodeId = startNodeForPatch(input.patch, input.failedAttempt.nodeId);
  const trace = await runAutomationStudioGraph(patchedFlow, {
    ...(input.options ?? {}),
    startNodeId,
    inputs: input.failedAttempt.inputs,
    maxSteps: Math.min(input.options?.maxSteps ?? 50, 50)
  });
  const restoredExpectedState = runtimePatchRestoredExpectedState(trace, input.expectedComparison);
  const retryOriginalAction = restoredExpectedState && input.patch.kind !== "temporary_action_sequence";
  const adaptation = adaptationFromRuntimePatch(input, trace, restoredExpectedState);
  const changeProposal = restoredExpectedState && requiresChangeProposalForRuntimePatch(input.patch)
    ? changeProposalFromRuntimePatch(input, adaptation)
    : undefined;
  return {
    patch: input.patch,
    preflight,
    trace,
    restoredExpectedState,
    retryOriginalAction,
    adaptation,
    ...(changeProposal ? { changeProposal } : {})
  };
}

export function adaptationFromRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput, trace: AutomationStudioGraphExecutionTrace | undefined, restoredExpectedState: boolean): AutomationStudioFlowAdaptation {
  const now = input.now?.() ?? Date.now();
  const patch = changePatchFromRuntimePatch(input.patch);
  return {
    schemaVersion: "0.1",
    adaptationId: `adaptation.${input.runId}.${safePatchSegment(input.patch.kind)}.${now}`,
    flowId: input.flowId,
    projectId: input.projectId,
    sourceRunId: input.runId,
    trigger: `Runtime patch ${input.patch.kind} ${restoredExpectedState ? "restored expected state" : "failed to restore expected state"}.`,
    failedAction: {
      attemptId: input.failedAttempt.attemptId,
      nodeId: input.failedAttempt.nodeId,
      definitionId: input.failedAttempt.definitionId,
      status: input.failedAttempt.status,
      route: input.failedAttempt.route ?? ""
    },
    diagnosis: input.patch.reason,
    patch: [patch],
    validationResults: [{
      runId: input.runId,
      status: restoredExpectedState ? "succeeded" : "failed",
      checkedAt: now,
      detail: trace?.message ?? `Runtime patch trace ${trace?.status ?? "not-run"}.`
    }],
    status: restoredExpectedState ? "validated" : "rejected",
    author: "runtime",
    riskLevel: patchRisk(input.patch),
    createdAt: now,
    updatedAt: now,
    metadata: {
      runtimePatchKind: input.patch.kind,
      traceStatus: trace?.status ?? "not-run",
      retryOriginalAction: restoredExpectedState && input.patch.kind !== "temporary_action_sequence"
    }
  };
}

function changeProposalFromRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput, adaptation: AutomationStudioFlowAdaptation): AutomationStudioFlowChangeProposal {
  const now = input.now?.() ?? Date.now();
  return {
    schemaVersion: "0.1",
    proposalId: `proposal.${adaptation.adaptationId}`,
    flowId: input.flowId,
    projectId: input.projectId,
    sourceRunId: input.runId,
    sourceAdaptationId: adaptation.adaptationId,
    mode: input.proposalMode ?? "auto",
    status: input.proposalMode === "manual" ? "pending" : "auto_approved",
    riskLevel: adaptation.riskLevel,
    patches: adaptation.patch,
    createdBy: "runtime",
    createdAt: now,
    updatedAt: now,
    metadata: { runtimePatchKind: input.patch.kind }
  };
}

function applyRuntimePatchToFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch): AutomationStudioFlowDocument {
  const next: AutomationStudioFlowDocument = structuredClone(flow);
  if (patch.kind === "temporary_wait_retry") {
    const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
    if (node) node.parameterValues = { ...(node.parameterValues ?? {}), ...(patch.timeoutMs !== undefined ? { timeoutMs: patch.timeoutMs } : {}), ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}) };
  }
  if (patch.kind === "temporary_target_override") {
    const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
    if (node) node.parameterValues = { ...(node.parameterValues ?? {}), target: patch.target };
  }
  if (patch.kind === "temporary_reroute" && !next.edges.some((edge) => edge.sourceNodeId === patch.fromNodeId && edge.targetNodeId === patch.toNodeId && edge.sourcePortId === "success")) {
    next.edges.push({ id: `runtime-patch.${patch.fromNodeId}.${patch.toNodeId}`, sourceNodeId: patch.fromNodeId, sourcePortId: "success", targetNodeId: patch.toNodeId, targetPortId: "in" });
  }
  return next;
}

function runtimePatchRestoredExpectedState(trace: AutomationStudioGraphExecutionTrace, comparison: AutomationStudioTransitionComparison | undefined): boolean {
  if (trace.status !== "succeeded") return false;
  if (!comparison) return true;
  if (comparison.expected.expectedRoute && trace.attempts.some((attempt) => attempt.route === comparison.expected.expectedRoute)) return true;
  const expectedOutputs = Object.keys(comparison.expected.expectedOutputs ?? {});
  return expectedOutputs.every((outputId) => trace.values[outputId] !== undefined || trace.attempts.some((attempt) => attempt.outputs[outputId] !== undefined));
}

function changePatchFromRuntimePatch(patch: AutomationStudioRuntimePatch): AutomationStudioFlowAdaptation["patch"][number] {
  if (patch.kind === "temporary_reroute") return { kind: "edit_router", targetId: patch.fromNodeId, summary: patch.reason, after: { toNodeId: patch.toNodeId } };
  if (patch.kind === "temporary_target_override") return { kind: "edit_action_target", targetId: patch.targetNodeId, summary: patch.reason, after: patch.target };
  if (patch.kind === "temporary_recovery_subflow_call") return { kind: "edit_recovery", targetId: patch.subflowId, summary: patch.reason };
  if (patch.kind === "temporary_wait_retry") return { kind: "edit_expectation", targetId: patch.targetNodeId, summary: patch.reason, after: { timeoutMs: patch.timeoutMs ?? null, retryCount: patch.retryCount ?? null } };
  return { kind: "edit_recovery", targetId: patch.targetNodeId, summary: patch.reason, after: { actionDefinitionIds: patch.actionDefinitionIds } };
}

function patchMayCauseExternalSideEffects(patch: AutomationStudioRuntimePatch): boolean {
  return patch.kind === "temporary_action_sequence" || patch.kind === "temporary_target_override";
}

function runtimePatchTargetsFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch): boolean {
  if (patch.kind === "temporary_recovery_subflow_call") return Boolean(flow.metadata?.subflowIds || patch.subflowId);
  if (patch.kind === "temporary_reroute") return flow.nodes.some((node) => node.id === patch.fromNodeId) && flow.nodes.some((node) => node.id === patch.toNodeId);
  if ("targetNodeId" in patch) return flow.nodes.some((node) => node.id === patch.targetNodeId);
  return true;
}

function startNodeForPatch(patch: AutomationStudioRuntimePatch, failedNodeId: string): string {
  if (patch.kind === "temporary_reroute") return patch.toNodeId;
  if ("targetNodeId" in patch) return patch.targetNodeId;
  return failedNodeId;
}

function requiresChangeProposalForRuntimePatch(patch: AutomationStudioRuntimePatch): boolean {
  return patch.kind === "temporary_reroute" || patch.kind === "temporary_recovery_subflow_call";
}

function requiredHostCapabilitiesForRuntimePatch(patch: AutomationStudioRuntimePatch): string[] {
  if (patch.kind === "temporary_wait_retry") return ["wait-observe"];
  if (patch.kind === "temporary_target_override" || patch.kind === "temporary_action_sequence") return ["action-dispatch"];
  if (patch.kind === "temporary_recovery_subflow_call") return ["action-dispatch"];
  return [];
}

function patchRisk(patch: AutomationStudioRuntimePatch): AutomationStudioFlowAdaptation["riskLevel"] {
  if (patch.kind === "temporary_action_sequence" || patch.kind === "temporary_target_override") return "high";
  if (patch.kind === "temporary_reroute" || patch.kind === "temporary_recovery_subflow_call") return "medium";
  return "low";
}

function safePatchSegment(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "patch";
}
