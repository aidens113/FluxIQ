import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowChangeProposal,
  AutomationStudioFlowDocument
} from "../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "./adaptive-orchestrator.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace, type AutomationStudioTransitionComparison } from "./executor.ts";
import { isAutomationStudioRuntimeTargetOverrideTarget, type AutomationStudioRuntimePatch, type AutomationStudioRuntimeTargetOverrideTarget } from "./llm/index.ts";

export type AutomationStudioRuntimePatchPreflight = {
  ok: boolean;
  issues: string[];
  requiresExternalSideEffectApproval: boolean;
};

/**
 * What a runtime patch rerun actually proved.
 *
 * `verified` is the only outcome that may produce a `validationResults` entry:
 * it means the rerun executed and a declared expectation was observed in the
 * trace. `unverifiable` means nothing was declared to compare against, so no
 * validation may be recorded at all — success is never inferred from the
 * absence of contradicting evidence.
 */
export type AutomationStudioRuntimePatchVerification =
  | { status: "verified"; basis: "expected_route" | "expected_outputs" }
  | { status: "unverifiable"; reason: "no_expectation_declared" | "expectation_empty" }
  | { status: "contradicted"; reason: string }
  | { status: "not_executed"; reason: string };

export type AutomationStudioRuntimePatchExecutionResult = {
  patch: AutomationStudioRuntimePatch;
  preflight: AutomationStudioRuntimePatchPreflight;
  trace?: AutomationStudioGraphExecutionTrace;
  verification?: AutomationStudioRuntimePatchVerification;
  /** True only when `verification.status` is `verified`. */
  restoredExpectedState: boolean;
  retryOriginalAction: boolean;
  adaptation?: AutomationStudioFlowAdaptation;
  changeProposal?: AutomationStudioFlowChangeProposal;
  metadata?: JsonObject;
};

export type AutomationStudioRuntimeTargetOverrideEvidenceValidation =
  | { status: "matched" }
  | { status: "resolved"; target: AutomationStudioRuntimeTargetOverrideTarget }
  | { status: "absent" | "ambiguous" };

/** Bounded, domain-neutral identity of the action whose target failed. */
export type AutomationStudioRuntimeTargetOverrideFailedAction = Readonly<{
  nodeId: string;
  definitionId: string;
}>;

export type AutomationStudioRuntimePatchExecutionInput = {
  projectId: string;
  flowId: string;
  subflowId?: string;
  runId: string;
  flow: AutomationStudioFlowDocument;
  patch: AutomationStudioRuntimePatch;
  /**
   * The attempt that failed, as the run executed it: a rerun is seeded from its
   * `inputs`. A saved trace's copy reads `[withheld]` wherever the run withheld a
   * value, so a rerun seeded from it would execute with the marker.
   */
  failedAttempt: AutomationStudioNodeAttemptTrace;
  expectedComparison?: AutomationStudioTransitionComparison;
  policy?: AutomationStudioAdaptationPolicy;
  proposalMode?: "auto" | "manual" | "mixed";
  authorizedExternalSideEffects?: boolean;
  hostCapabilities?: Iterable<string>;
  /** Domain-owned validation against sanitized evidence, bound to the failed action kind without exposing trace values. */
  validateTargetOverrideEvidence?: (
    target: AutomationStudioRuntimeTargetOverrideTarget,
    failedAction: AutomationStudioRuntimeTargetOverrideFailedAction
  ) => AutomationStudioRuntimeTargetOverrideEvidenceValidation;
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

/**
 * Validates a target override as a durable manual-review proposal without
 * authorizing or executing the proposed target against a host runtime.
 */
export function preflightAutomationStudioRuntimeTargetOverrideProposal(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioRuntimePatchPreflight {
  return evaluateAutomationStudioRuntimeTargetOverrideProposal(input).preflight;
}

function evaluateAutomationStudioRuntimeTargetOverrideProposal(input: AutomationStudioRuntimePatchExecutionInput): {
  preflight: AutomationStudioRuntimePatchPreflight;
  patch: AutomationStudioRuntimePatch;
  targetResolution?: "matched" | "resolved";
  targetNodeResolution?: "matched" | "resolved";
} {
  const issues: string[] = [];
  let patch = input.patch;
  let targetResolution: "matched" | "resolved" | undefined;
  let targetNodeResolution: "matched" | "resolved" | undefined;
  if (input.patch.kind !== "temporary_target_override") issues.push("Proposal-only runtime patch validation supports target overrides only.");
  if (input.patch.kind === "temporary_target_override" && input.policy && !input.policy.allowModifyActionTargets) issues.push("Action target overrides are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_target_override") {
    if (!input.flow.nodes.some((node) => node.id === input.failedAttempt.nodeId)) {
      issues.push("Failed action node is not present in this Flow.");
    } else if (input.patch.targetNodeId === input.failedAttempt.nodeId) {
      targetNodeResolution = "matched";
    } else {
      patch = { ...input.patch, targetNodeId: input.failedAttempt.nodeId };
      targetNodeResolution = "resolved";
    }
  } else if (!runtimePatchTargetsFlow(input.flow, input.patch)) {
    issues.push("Runtime patch points at a node or subflow that is not present in this Flow.");
  }
  if (input.patch.kind === "temporary_target_override" && input.validateTargetOverrideEvidence) {
    const validation = input.validateTargetOverrideEvidence(input.patch.target, {
      nodeId: input.failedAttempt.nodeId,
      definitionId: input.failedAttempt.definitionId
    });
    if (validation.status === "absent") issues.push("Target override is absent from current sanitized evidence.");
    if (validation.status === "ambiguous") issues.push("Target override is ambiguous in current sanitized evidence.");
    if (validation.status === "matched") targetResolution = "matched";
    if (validation.status === "resolved") {
      if (isAutomationStudioRuntimeTargetOverrideTarget(validation.target) && patch.kind === "temporary_target_override") {
        // Preserve any authoritative failed-node rewrite performed above when
        // the domain also resolves the target from its own sanitized evidence.
        patch = { ...patch, target: validation.target };
        targetResolution = "resolved";
      } else {
        issues.push("Resolved target override is invalid.");
      }
    }
  }
  return {
    preflight: { ok: issues.length === 0, issues, requiresExternalSideEffectApproval: true },
    patch,
    ...(targetResolution ? { targetResolution } : {}),
    ...(targetNodeResolution ? { targetNodeResolution } : {})
  };
}

export function proposeAutomationStudioRuntimeTargetOverride(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioRuntimePatchExecutionResult {
  const evaluated = evaluateAutomationStudioRuntimeTargetOverrideProposal(input);
  const { preflight } = evaluated;
  if (!preflight.ok || input.patch.kind !== "temporary_target_override") {
    return { patch: input.patch, preflight, verification: { status: "not_executed", reason: "preflight_failed" }, restoredExpectedState: false, retryOriginalAction: false };
  }
  const resolvedInput = { ...input, patch: evaluated.patch };
  const adaptation = targetOverrideProposalAdaptation(resolvedInput, evaluated.targetResolution, evaluated.targetNodeResolution);
  return {
    patch: evaluated.patch,
    preflight,
    verification: { status: "not_executed", reason: "proposal_only" },
    restoredExpectedState: false,
    retryOriginalAction: false,
    adaptation,
    changeProposal: changeProposalFromRuntimePatch(resolvedInput, adaptation),
    metadata: {
      proposalOnly: true,
      executed: false,
      ...(evaluated.targetResolution ? { targetResolution: evaluated.targetResolution } : {}),
      ...(evaluated.targetNodeResolution ? { targetNodeResolution: evaluated.targetNodeResolution } : {})
    }
  };
}

export async function executeAutomationStudioRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput): Promise<AutomationStudioRuntimePatchExecutionResult> {
  const preflight = preflightAutomationStudioRuntimePatch(input);
  if (!preflight.ok) return { patch: input.patch, preflight, verification: { status: "not_executed", reason: "preflight_failed" }, restoredExpectedState: false, retryOriginalAction: false };
  const application = applyRuntimePatchToFlow(input.flow, input.patch);
  // Fail closed: a patch kind with no application branch would otherwise send
  // the ORIGINAL flow to the rerun, and that rerun's success would be recorded
  // against a patch that never took effect.
  if (!application.applied) {
    return { patch: input.patch, preflight, verification: { status: "not_executed", reason: application.reason }, restoredExpectedState: false, retryOriginalAction: false };
  }
  const startNodeId = startNodeForPatch(input.patch, input.failedAttempt.nodeId);
  const trace = await runAutomationStudioGraph(application.flow, {
    ...(input.options ?? {}),
    startNodeId,
    inputs: input.failedAttempt.inputs,
    maxSteps: Math.min(input.options?.maxSteps ?? 50, 50)
  });
  const verification = verifyRuntimePatchOutcome(trace, input.expectedComparison);
  const restoredExpectedState = verification.status === "verified";
  const retryOriginalAction = restoredExpectedState && input.patch.kind !== "temporary_action_sequence";
  const adaptation = adaptationFromRuntimePatch(input, trace, verification);
  const changeProposal = restoredExpectedState && requiresChangeProposalForRuntimePatch(input.patch)
    ? changeProposalFromRuntimePatch(input, adaptation)
    : undefined;
  return {
    patch: input.patch,
    preflight,
    trace,
    verification,
    restoredExpectedState,
    retryOriginalAction,
    adaptation,
    ...(changeProposal ? { changeProposal } : {})
  };
}

export function adaptationFromRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput, trace: AutomationStudioGraphExecutionTrace | undefined, verification: AutomationStudioRuntimePatchVerification): AutomationStudioFlowAdaptation {
  const now = input.now?.() ?? Date.now();
  const patch = changePatchFromRuntimePatch(input.patch);
  const restoredExpectedState = verification.status === "verified";
  // An `unverifiable` rerun proved nothing, so it records no validation at all
  // and the adaptation stays in `testing` until something can compare it.
  const validationResults = verification.status === "unverifiable"
    ? undefined
    : [{
      runId: input.runId,
      status: restoredExpectedState ? "succeeded" as const : "failed" as const,
      checkedAt: now,
      detail: runtimePatchVerificationDetail(verification, trace)
    }];
  return {
    schemaVersion: "0.1",
    adaptationId: `adaptation.${input.runId}.${safePatchSegment(input.patch.kind)}.${now}`,
    flowId: input.flowId,
    projectId: input.projectId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    sourceRunId: input.runId,
    trigger: `Runtime patch ${input.patch.kind} ${runtimePatchVerificationTrigger(verification)}.`,
    failedAction: {
      attemptId: input.failedAttempt.attemptId,
      nodeId: input.failedAttempt.nodeId,
      definitionId: input.failedAttempt.definitionId,
      status: input.failedAttempt.status,
      route: input.failedAttempt.route ?? ""
    },
    diagnosis: input.patch.reason,
    patch: [patch],
    ...(validationResults ? { validationResults } : {}),
    status: adaptationStatusForVerification(verification),
    author: "runtime",
    riskLevel: patchRisk(input.patch),
    createdAt: now,
    updatedAt: now,
    metadata: {
      runtimePatchKind: input.patch.kind,
      traceStatus: trace?.status ?? "not-run",
      verification: { ...verification },
      failureSignature: runtimePatchFailureSignature(input),
      retryOriginalAction: restoredExpectedState && input.patch.kind !== "temporary_action_sequence"
    }
  };
}

function adaptationStatusForVerification(verification: AutomationStudioRuntimePatchVerification): AutomationStudioFlowAdaptation["status"] {
  if (verification.status === "verified") return "validated";
  if (verification.status === "unverifiable") return "testing";
  return "rejected";
}

function runtimePatchVerificationTrigger(verification: AutomationStudioRuntimePatchVerification): string {
  if (verification.status === "verified") return "restored expected state";
  if (verification.status === "unverifiable") return "ran without a declared expectation to compare against";
  if (verification.status === "not_executed") return "was not executed";
  return "failed to restore expected state";
}

function runtimePatchVerificationDetail(verification: AutomationStudioRuntimePatchVerification, trace: AutomationStudioGraphExecutionTrace | undefined): string {
  const observed = trace?.message ?? `Runtime patch trace ${trace?.status ?? "not-run"}.`;
  if (verification.status === "verified") return `Observed ${verification.basis}. ${observed}`;
  if (verification.status === "unverifiable") return `Nothing to compare (${verification.reason}). ${observed}`;
  return `${verification.reason}. ${observed}`;
}

function changeProposalFromRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput, adaptation: AutomationStudioFlowAdaptation): AutomationStudioFlowChangeProposal {
  const now = input.now?.() ?? Date.now();
  return {
    schemaVersion: "0.1",
    proposalId: `proposal.${adaptation.adaptationId}`,
    flowId: input.flowId,
    projectId: input.projectId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
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

function targetOverrideProposalAdaptation(
  input: AutomationStudioRuntimePatchExecutionInput,
  targetResolution?: "matched" | "resolved",
  targetNodeResolution?: "matched" | "resolved"
): AutomationStudioFlowAdaptation {
  const now = input.now?.() ?? Date.now();
  return {
    schemaVersion: "0.1",
    adaptationId: `adaptation.${input.runId}.${safePatchSegment(input.patch.kind)}.${now}`,
    flowId: input.flowId,
    projectId: input.projectId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    sourceRunId: input.runId,
    trigger: "Runtime target override was structurally validated for manual review without execution.",
    failedAction: {
      attemptId: input.failedAttempt.attemptId,
      nodeId: input.failedAttempt.nodeId,
      definitionId: input.failedAttempt.definitionId,
      status: input.failedAttempt.status,
      route: input.failedAttempt.route ?? ""
    },
    diagnosis: input.patch.reason,
    patch: [changePatchFromRuntimePatch(input.patch)],
    // No `validationResults`: this proposal declares `executed: false` in the
    // same object, and a validation entry means "it ran and was compared". The
    // structural check that did happen is recorded where no consumer asking
    // "was this validated?" can mistake it for an executed run.
    status: "proposed",
    author: "runtime",
    riskLevel: "high",
    createdAt: now,
    updatedAt: now,
    metadata: {
      runtimePatchKind: input.patch.kind,
      proposalOnly: true,
      executed: false,
      traceStatus: "not-run",
      verification: { status: "not_executed", reason: "proposal_only" },
      failureSignature: runtimePatchFailureSignature(input),
      structuralChecks: [{ check: "target_resolution", status: "passed", detail: "Target node and selector resolved against this Flow without execution." }],
      retryOriginalAction: false,
      ...(targetResolution ? { targetResolution } : {}),
      ...(targetNodeResolution ? { targetNodeResolution } : {})
    }
  };
}

type AutomationStudioRuntimePatchApplication =
  | { applied: true; flow: AutomationStudioFlowDocument }
  | { applied: false; reason: string };

/**
 * Applies a runtime patch to a throwaway copy of the Flow, or says plainly that
 * it could not. The switch is exhaustive by construction: a new patch kind
 * fails the type check in `unappliedRuntimePatchKind` until it is either
 * applied here or explicitly refused.
 */
function applyRuntimePatchToFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch): AutomationStudioRuntimePatchApplication {
  const next: AutomationStudioFlowDocument = structuredClone(flow);
  switch (patch.kind) {
    case "temporary_wait_retry": {
      const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
      if (!node) return { applied: false, reason: `target_node_absent:${patch.targetNodeId}` };
      node.parameterValues = { ...(node.parameterValues ?? {}), ...(patch.timeoutMs !== undefined ? { timeoutMs: patch.timeoutMs } : {}), ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}) };
      return { applied: true, flow: next };
    }
    case "temporary_target_override": {
      const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
      if (!node) return { applied: false, reason: `target_node_absent:${patch.targetNodeId}` };
      node.parameterValues = { ...(node.parameterValues ?? {}), target: patch.target };
      return { applied: true, flow: next };
    }
    case "temporary_reroute": {
      if (!next.nodes.some((node) => node.id === patch.fromNodeId) || !next.nodes.some((node) => node.id === patch.toNodeId)) {
        return { applied: false, reason: `reroute_node_absent:${patch.fromNodeId}->${patch.toNodeId}` };
      }
      if (!next.edges.some((edge) => edge.sourceNodeId === patch.fromNodeId && edge.targetNodeId === patch.toNodeId && edge.sourcePortId === "success")) {
        next.edges.push({ id: `runtime-patch.${patch.fromNodeId}.${patch.toNodeId}`, sourceNodeId: patch.fromNodeId, sourcePortId: "success", targetNodeId: patch.toNodeId, targetPortId: "in" });
      }
      return { applied: true, flow: next };
    }
    // No application exists for these two kinds. Refusing them here is what
    // stops the rerun from validating the unmodified Flow.
    case "temporary_action_sequence":
    case "temporary_recovery_subflow_call":
      return { applied: false, reason: `unapplied_patch_kind:${patch.kind}` };
    default:
      return unappliedRuntimePatchKind(patch);
  }
}

// Compile-time exhaustiveness: a new runtime patch kind fails the type check
// here until it is applied or explicitly refused above.
function unappliedRuntimePatchKind(patch: never): AutomationStudioRuntimePatchApplication {
  return { applied: false, reason: `unapplied_patch_kind:${(patch as { kind?: string }).kind ?? "unknown"}` };
}

/**
 * Decides what the rerun proved, never inferring success from silence. A rerun
 * that merely failed to contradict an expectation nobody declared is
 * `unverifiable`, not a success: every declared part of the expectation must be
 * observed in the trace before `verified` is returned.
 */
function verifyRuntimePatchOutcome(trace: AutomationStudioGraphExecutionTrace, comparison: AutomationStudioTransitionComparison | undefined): AutomationStudioRuntimePatchVerification {
  if (trace.status !== "succeeded") return { status: "contradicted", reason: `rerun_${trace.status}` };
  if (!comparison) return { status: "unverifiable", reason: "no_expectation_declared" };
  // An expected route that merely repeats the route the failure already took is
  // the executor's fallback, not a declaration: matching it again would mean
  // reproducing the failure, so it cannot tell a repair from the original.
  const expectedRoute = comparison.expected.expectedRoute && comparison.expected.expectedRoute !== comparison.actual.route
    ? comparison.expected.expectedRoute
    : undefined;
  const expectedOutputIds = Object.keys(comparison.expected.expectedOutputs ?? {});
  if (!expectedRoute && !expectedOutputIds.length) return { status: "unverifiable", reason: "expectation_empty" };
  if (expectedRoute && !trace.attempts.some((attempt) => attempt.route === expectedRoute)) {
    return { status: "contradicted", reason: "expected_route_not_observed" };
  }
  const missingOutputIds = expectedOutputIds.filter((outputId) => trace.values[outputId] === undefined && !trace.attempts.some((attempt) => attempt.outputs[outputId] !== undefined));
  if (missingOutputIds.length) return { status: "contradicted", reason: `expected_outputs_not_observed:${missingOutputIds.join(",")}` };
  return { status: "verified", basis: expectedRoute ? "expected_route" : "expected_outputs" };
}

function changePatchFromRuntimePatch(patch: AutomationStudioRuntimePatch): AutomationStudioFlowAdaptation["patch"][number] {
  if (patch.kind === "temporary_reroute") return { kind: "edit_router", targetId: patch.fromNodeId, summary: patch.reason, after: { toNodeId: patch.toNodeId } };
  if (patch.kind === "temporary_target_override") return { kind: "edit_action_target", targetId: patch.targetNodeId, summary: patch.reason, after: patch.target, metadata: { externalSideEffect: true } };
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

/**
 * The failure class this adaptation was made for, so a later failure of the
 * same class on another node can still find it. The node-identity clause of
 * `adaptationMatchesFailure` cannot do that, and nothing wrote this field.
 */
function runtimePatchFailureSignature(input: AutomationStudioRuntimePatchExecutionInput): string {
  return classifyAutomationStudioAdaptiveFailure({
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    attempt: input.failedAttempt
  }).signature;
}

function safePatchSegment(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "patch";
}
