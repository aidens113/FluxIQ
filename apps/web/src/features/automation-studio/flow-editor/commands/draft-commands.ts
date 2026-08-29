import type { AutomationStudioFlowDocument } from "fluxiq/automation-studio";
import { diffAutomationGraphDocuments } from "../../graph/operation-history";
import { graphToTaskFlow } from "../../model/project-artifacts";
import {
  AUTOMATION_FLOW_ENDPOINTS,
  flowCommandPostflight,
  flowCommandPreflight,
  flowCommandRequestFailure,
  flowCommandThrownFailure,
  type AutomationFlowCommandCapabilities,
  type AutomationFlowCommandOutcome,
  type AutomationFlowCommandScope,
  type AutomationFlowScopeGuard
} from "./command-contracts";
import type { AutomationFlowDraftRepository } from "./draft-repository";

export type AutomationEditableFlowGraph = { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> };
export type AutomationRecoverableFlowDraft = {
  projectId: string;
  flowId: string;
  savedAt: number;
  graph: AutomationEditableFlowGraph;
};

export function restoreAutomationFlowDraft(
  input: { scope: AutomationFlowCommandScope; draftKey: string | null; draft: AutomationRecoverableFlowDraft | null; signal?: AbortSignal },
  guard: AutomationFlowScopeGuard
): AutomationFlowCommandOutcome<{ draftKey: string; graph: AutomationEditableFlowGraph; savedAt: number }> {
  const preflight = flowCommandPreflight<{ draftKey: string; graph: AutomationEditableFlowGraph; savedAt: number }>(input.scope, guard, input.signal);
  if (preflight) return preflight;
  if (!input.draftKey || !input.draft) return { status: "failure", code: "DRAFT_REQUIRED", error: "No recoverable Flow draft is available." };
  if (input.draft.projectId !== input.scope.projectId) return { status: "stale", reason: "The recoverable draft belongs to another project." };
  return { status: "success", value: { draftKey: input.draftKey, graph: input.draft.graph, savedAt: input.draft.savedAt } };
}

export async function discardAutomationFlowDraft(
  input: { scope: AutomationFlowCommandScope; flowId: string; signal?: AbortSignal },
  capabilities: AutomationFlowScopeGuard & { drafts: AutomationFlowDraftRepository }
): Promise<AutomationFlowCommandOutcome<{ flowId: string }>> {
  const preflight = flowCommandPreflight<{ flowId: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  try {
    capabilities.drafts.removeSnapshot(input.scope.projectId, input.flowId);
    await capabilities.drafts.removeOperations(input.scope.projectId, input.flowId);
    const postflight = flowCommandPostflight<{ flowId: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    return { status: "success", value: { flowId: input.flowId } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "The Flow draft could not be discarded.");
  }
}

export function persistAutomationFlowDraft(
  input: { scope: AutomationFlowCommandScope; flowId: string; baseUpdatedAt: number; graph: AutomationEditableFlowGraph; savedAt?: number; signal?: AbortSignal },
  capabilities: AutomationFlowScopeGuard & { drafts: AutomationFlowDraftRepository }
): AutomationFlowCommandOutcome<{ savedAt: number }> {
  const preflight = flowCommandPreflight<{ savedAt: number }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  const savedAt = input.savedAt ?? Date.now();
  const stored = capabilities.drafts.saveSnapshot({
    projectId: input.scope.projectId,
    flowId: input.flowId,
    baseUpdatedAt: input.baseUpdatedAt,
    savedAt,
    graph: input.graph
  });
  return stored
    ? { status: "success", value: { savedAt } }
    : { status: "failure", code: "DRAFT_STORAGE_UNAVAILABLE", error: "The Flow draft could not be preserved in browser storage." };
}

export async function updateAutomationFlowDraft(
  input: {
    scope: AutomationFlowCommandScope;
    flowId: string;
    graph: AutomationEditableFlowGraph | null;
    baseGraph: AutomationEditableFlowGraph | null;
    baseRevision: string;
    baseUpdatedAt: number;
    savedAt?: number;
    signal?: AbortSignal;
  },
  capabilities: AutomationFlowScopeGuard & { drafts: AutomationFlowDraftRepository }
): Promise<AutomationFlowCommandOutcome<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>> {
  const preflight = flowCommandPreflight<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  try {
    if (!input.graph) {
      await capabilities.drafts.removeOperations(input.scope.projectId, input.flowId);
      const postflight = flowCommandPostflight<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>(input.scope, capabilities, input.signal);
      return postflight ?? { status: "success", value: { graph: null, persisted: true, operationCount: 0 } };
    }
    if (!input.baseGraph) return { status: "success", value: { graph: input.graph, persisted: false, operationCount: 0 } };
    const batch = diffAutomationGraphDocuments(input.baseGraph as any, input.graph as any, { baseRevision: input.baseRevision, ...(input.savedAt !== undefined ? { now: input.savedAt } : {}) });
    const persisted = await capabilities.drafts.saveOperations({
      projectId: input.scope.projectId,
      flowId: input.flowId,
      baseRevision: batch.baseRevision,
      baseUpdatedAt: input.baseUpdatedAt,
      savedAt: input.savedAt ?? Date.now(),
      operations: batch.operations,
      estimatedBytes: batch.estimatedBytes
    });
    const postflight = flowCommandPostflight<{ graph: AutomationEditableFlowGraph | null; persisted: boolean; operationCount: number }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    return persisted
      ? { status: "success", value: { graph: input.graph, persisted: true, operationCount: batch.operations.length } }
      : { status: "failure", code: "DRAFT_STORAGE_UNAVAILABLE", error: "The Flow operation draft could not be preserved." };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "The Flow draft could not be updated.");
  }
}

export async function saveAutomationFlowDraft(
  input: {
    scope: AutomationFlowCommandScope;
    flow: AutomationStudioFlowDocument;
    graph: AutomationEditableFlowGraph;
    authorizationPin: string;
    canonical: boolean;
    signal?: AbortSignal;
  },
  capabilities: AutomationFlowCommandCapabilities & { drafts: AutomationFlowDraftRepository }
): Promise<AutomationFlowCommandOutcome<{ flow: AutomationStudioFlowDocument; flowId: string }>> {
  const preflight = flowCommandPreflight<{ flow: AutomationStudioFlowDocument; flowId: string }>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;
  if (!input.canonical) return { status: "failure", code: "READ_ONLY_FLOW", error: "Only canonical Flows can be saved." };
  if (input.authorizationPin.length < 4) return { status: "failure", code: "AUTHORIZATION_REQUIRED", error: "PIN is required to save a Flow." };
  const serialized = graphToTaskFlow({
    task: { taskId: input.flow.flowId, name: input.flow.name } as any,
    existingFlow: { ...input.flow, ownerKind: "flow", ownerId: input.flow.flowId } as any,
    graph: input.graph
  });
  const { regions: _regions, regionHandoffs: _regionHandoffs, ...flow } = input.flow as AutomationStudioFlowDocument & { regions?: unknown; regionHandoffs?: unknown };
  const expectedUpdatedAt = capabilities.drafts.loadSnapshot(input.scope.projectId, input.flow.flowId)?.baseUpdatedAt ?? input.flow.updatedAt;
  try {
    const response = await capabilities.api.post<{ flow?: AutomationStudioFlowDocument }>(AUTOMATION_FLOW_ENDPOINTS.save, {
      projectId: input.scope.projectId,
      authorizationPin: input.authorizationPin,
      expectedUpdatedAt,
      flow: { ...flow, nodes: serialized.nodes, edges: serialized.edges }
    }, input.signal ? { signal: input.signal } : {});
    const postflight = flowCommandPostflight<{ flow: AutomationStudioFlowDocument; flowId: string }>(input.scope, capabilities, input.signal);
    if (postflight) return postflight;
    if (!response.ok || !response.payload?.flow) {
      const failure = flowCommandRequestFailure<{ flow: AutomationStudioFlowDocument; flowId: string }>(response, "Flow could not be saved.");
      return failure.status === "failure" && failure.error.includes("FLOW_SAVE_CONFLICT")
        ? { status: "failure", code: "FLOW_SAVE_CONFLICT", error: "This Flow changed after the draft began. The draft has been preserved." }
        : failure;
    }
    capabilities.drafts.removeSnapshot(input.scope.projectId, input.flow.flowId);
    await capabilities.drafts.removeOperations(input.scope.projectId, input.flow.flowId);
    return { status: "success", value: { flow: response.payload.flow, flowId: input.flow.flowId } };
  } catch (error) {
    return flowCommandThrownFailure(error, input.signal, "Flow could not be saved.");
  }
}
