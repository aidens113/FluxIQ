// How a Flow Bootstrap adaptation is shown for review: the projection of the
// bootstrap record onto the Flow adaptation shape the review surfaces read,
// with the Router and each Subflow it would create as patch entries, and the
// accounting check that projection and the generation path both apply to a
// build's recorded usage.
//
// Moved out of runtime/service.ts unchanged, so the service keeps room for the
// work that extends Flow Bootstrap; the service imports both through this
// directory's barrel.
import type { AutomationStudioFlowAdaptation } from "../../model/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS } from "../loop-limits/index.ts";
import {
  assertAutomationStudioBootstrapHasNoRecordingProvenance,
  type AutomationStudioBootstrapAccounting,
  type AutomationStudioBootstrapAdaptation
} from "./adaptation.ts";

export function sanitizedBootstrapAccounting(value: AutomationStudioBootstrapAccounting): AutomationStudioBootstrapAccounting {
  const boundedText = (item: unknown, label: string): string => {
    if (typeof item !== "string" || !item.trim() || item.length > 200 || /[\u0000-\u001f\u007f]/.test(item)) throw new Error(`Flow Bootstrap ${label} is invalid.`);
    return item.trim();
  };
  const boundedInteger = (item: unknown, label: string): number => {
    if (!Number.isSafeInteger(item) || (item as number) < 0 || (item as number) > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS) throw new Error(`Flow Bootstrap ${label} is invalid.`);
    return item as number;
  };
  const boundedCost = (item: unknown): number => {
    if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 10) throw new Error("Flow Bootstrap estimated cost is invalid.");
    return item;
  };
  return {
    requestId: boundedText(value.requestId, "request ID"),
    estimatedInputTokens: boundedInteger(value.estimatedInputTokens, "estimated input tokens"),
    ...(value.provider !== undefined ? { provider: boundedText(value.provider, "provider") } : {}),
    ...(value.model !== undefined ? { model: boundedText(value.model, "model") } : {}),
    ...(value.inputTokens !== undefined ? { inputTokens: boundedInteger(value.inputTokens, "input tokens") } : {}),
    ...(value.outputTokens !== undefined ? { outputTokens: boundedInteger(value.outputTokens, "output tokens") } : {}),
    ...(value.totalTokens !== undefined ? { totalTokens: boundedInteger(value.totalTokens, "total tokens") } : {}),
    ...(value.estimatedCostUsd !== undefined ? { estimatedCostUsd: boundedCost(value.estimatedCostUsd) } : {})
  };
}

export function bootstrapAdaptationAsFlowAdaptation(
  adaptation: AutomationStudioBootstrapAdaptation,
  currentBinding: { executionDigest: string; settingsRevision: number }
): AutomationStudioFlowAdaptation {
  assertAutomationStudioBootstrapHasNoRecordingProvenance(adaptation);
  const accounting = adaptation.accounting ? sanitizedBootstrapAccounting(adaptation.accounting) : undefined;
  const topologySummary = {
    routerId: adaptation.topology.router.routerId,
    subflowCount: adaptation.topology.subflows.length,
    nodeCount: adaptation.topology.subflows.reduce((total, entry) => total + entry.graphFlow.nodes.length, 0),
    edgeCount: adaptation.topology.subflows.reduce((total, entry) => total + entry.graphFlow.edges.length, 0)
  };
  return {
    schemaVersion: "0.1",
    adaptationId: adaptation.adaptationId,
    flowId: adaptation.flowId,
    projectId: adaptation.projectId,
    sourceInstructionIds: [...adaptation.sourceInstructionIds],
    trigger: "Instruction-built Flow Bootstrap",
    diagnosis: adaptation.summary,
    patch: [
      {
        kind: "edit_router",
        targetId: adaptation.topology.router.routerId,
        summary: `Create Router ${adaptation.topology.router.name} with ${adaptation.topology.router.rules.length} rules.`,
        after: {
          routerId: adaptation.topology.router.routerId,
          name: adaptation.topology.router.name,
          ruleCount: adaptation.topology.router.rules.length,
          fallbackKind: adaptation.topology.router.fallback?.kind ?? "none"
        }
      },
      ...adaptation.topology.subflows.map((entry) => ({
        kind: "create_subflow" as const,
        targetId: entry.subflow.subflowId,
        summary: `Create ${entry.subflow.name} with ${entry.graphFlow.nodes.length} nodes and ${entry.graphFlow.edges.length} edges.`,
        after: {
          subflowId: entry.subflow.subflowId,
          graphFlowId: entry.graphFlow.flowId,
          name: entry.subflow.name,
          role: entry.subflow.role,
          nodeCount: entry.graphFlow.nodes.length,
          edgeCount: entry.graphFlow.edges.length
        }
      }))
    ],
    ...(adaptation.status === "applied" ? {
      appliedTo: [
        { kind: "router" as const, id: adaptation.topology.router.routerId },
        ...adaptation.topology.subflows.map((entry) => ({ kind: "subflow" as const, id: entry.subflow.subflowId }))
      ]
    } : {}),
    status: adaptation.status,
    author: "llm",
    riskLevel: adaptation.riskLevel,
    createdAt: adaptation.createdAt,
    updatedAt: adaptation.updatedAt,
    metadata: {
      adaptationKind: "flow_bootstrap",
      bootstrap: {
        baseExecutionDigest: adaptation.baseDependencyDigest,
        baseSettingsRevision: adaptation.baseSettingsRevision,
        currentExecutionDigest: currentBinding.executionDigest,
        currentSettingsRevision: currentBinding.settingsRevision,
        ...topologySummary,
        ...(accounting ? { accounting } : {}),
        ...(adaptation.application ? {
          application: {
            appliedAt: adaptation.application.appliedAt,
            appliedBy: adaptation.application.appliedBy,
            appliedExecutionDigest: adaptation.application.appliedDependencyDigest
          }
        } : {}),
        ...(adaptation.revert ? { revert: { ...adaptation.revert } } : {}),
        // What the build's own steps said they would do, and Core's reading of
        // that against the person's instruction. A review surface that shows a
        // Flow without them shows a Flow whose acts are unstated: the whole
        // point of the declaration is that the person sees it before approving.
        ...(adaptation.instructedConsequences?.length ? { instructedConsequences: structuredClone(adaptation.instructedConsequences) } : {}),
        ...(adaptation.declaredConsequences?.length ? { declaredConsequences: structuredClone(adaptation.declaredConsequences) } : {}),
        ...(adaptation.consequenceCrossCheck ? { consequenceCrossCheck: structuredClone(adaptation.consequenceCrossCheck) } : {}),
        ...(adaptation.permissionRequest ? { permissionRequest: structuredClone(adaptation.permissionRequest) } : {})
      },
      phase9: {
        auditEvents: (adaptation.auditEvents ?? []).map((event) => structuredClone(event)),
        auditTotal: adaptation.auditEvents?.length ?? 0,
        approvalMode: "manual_approval"
      }
    }
  };
}
