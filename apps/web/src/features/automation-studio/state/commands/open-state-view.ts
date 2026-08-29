import { automationStudioViewId } from "../../views/view-registry";
import type { NodeStatePhase, StateSnapshot } from "fluxiq/automation-studio";
import type { AutomationSelection } from "../../shared/selection-contracts";
import {
  stateCommandPostflight,
  stateCommandPreflight,
  type AutomationStateCommandCapabilities,
  type AutomationStateCommandOutcome,
  type AutomationStateDetail,
  type AutomationStatePublisher,
  type AutomationStateResolvedIndex,
  type AutomationStateViewRequest
} from "./command-contracts";
import { resolveAutomationStateIndex } from "./state-index-resolution";

type StateSelection = Extract<AutomationSelection, { kind: "state" }>;

export type OpenAutomationStateViewInput = {
  scope: { projectId: string; generation: number };
  request: AutomationStateViewRequest;
  signal?: AbortSignal;
};

export type OpenAutomationStateViewResult<TState extends StateSnapshot = StateSnapshot> = {
  requestKey: string;
  selection: StateSelection;
  resolved: AutomationStateResolvedIndex | null;
  detail: AutomationStateDetail<TState> | null;
};

export async function openAutomationStateView<TState extends StateSnapshot = StateSnapshot>(
  input: OpenAutomationStateViewInput,
  capabilities: AutomationStateCommandCapabilities & AutomationStatePublisher<TState>
): Promise<AutomationStateCommandOutcome<OpenAutomationStateViewResult<TState>>> {
  const preflight = stateCommandPreflight<OpenAutomationStateViewResult<TState>>(input.scope, capabilities, input.signal);
  if (preflight) return preflight;

  const requestKey = stateRequestKey(input.request);
  const initialSelection = stateViewSelection(input.request);
  const needsDetail = Boolean(input.request.recordingId && (input.request.timelineEntryId || input.request.stateSnapshotId));
  capabilities.publish({
    kind: "intent",
    scope: input.scope,
    requestKey,
    viewId: automationStudioViewId.state,
    loading: needsDetail,
    selection: initialSelection
  });

  if (!needsDetail) {
    const value = { requestKey, selection: initialSelection, resolved: null, detail: null };
    capabilities.publish({ kind: "resolved", scope: input.scope, ...value });
    return { status: "success", value };
  }

  await (capabilities.yieldToDetail?.() ?? Promise.resolve());
  const deferredPreflight = stateCommandPostflight<OpenAutomationStateViewResult<TState>>(input.scope, capabilities, input.signal);
  if (deferredPreflight) return deferredPreflight;

  const outcome = await resolveAutomationStateIndex<TState>({
    scope: input.scope,
    recordingId: input.request.recordingId!,
    ...(input.request.timelineEntryId ? { timelineEntryId: input.request.timelineEntryId } : {}),
    ...(input.request.stateSnapshotId ? { stateSnapshotId: input.request.stateSnapshotId } : {}),
    includeState: true,
    ...(input.signal ? { signal: input.signal } : {})
  }, capabilities);

  const publicationGuard = stateCommandPostflight<OpenAutomationStateViewResult<TState>>(input.scope, capabilities, input.signal);
  if (publicationGuard) return publicationGuard;
  if (outcome.status !== "success") {
    if (outcome.status === "failure") {
      capabilities.publish({ kind: "failure", scope: input.scope, requestKey, error: outcome.error });
    }
    return outcome;
  }

  const resolved = outcome.value.resolved;
  const selection = stateViewSelection({
    ...input.request,
    sourceId: `observed:${input.request.recordingId}:${resolved.entryId}`,
    timelineEntryId: input.request.timelineEntryId ?? resolved.entryId,
    stateSnapshotId: resolved.stateSnapshotId,
    stateRef: resolved.stateRef
  });
  const detail = outcome.value.state ? observedStateDetail(input.request.recordingId!, resolved, outcome.value.state) : null;
  const value = { requestKey, selection, resolved, detail };
  capabilities.publish({ kind: "resolved", scope: input.scope, ...value });
  return { status: "success", value };
}

export function stateRequestKey(request: AutomationStateViewRequest): string {
  return [
    request.recordingId ?? "",
    request.timelineEntryId ?? "",
    request.stateSnapshotId ?? "",
    request.phase ?? "input"
  ].join("::");
}

export function stateViewSelection(request: AutomationStateViewRequest): StateSelection {
  const phase: NodeStatePhase = request.phase ?? "input";
  return compact<StateSelection>({
    kind: "state",
    id: stateSelectionId(request),
    nodeId: request.nodeId,
    sourceId: request.sourceId,
    phase,
    evidenceId: request.evidenceId,
    factPath: request.factPath,
    recordingId: request.recordingId,
    proposalId: request.proposalId,
    timelineEntryId: request.timelineEntryId,
    stateSnapshotId: request.stateSnapshotId,
    stateRef: request.stateRef
  });
}

function stateSelectionId(request: AutomationStateViewRequest): string {
  if (request.proposalId && request.nodeId) return `state:${request.proposalId}:${request.nodeId}`;
  if (request.flowId && request.nodeId) return `state:${request.flowId}:${request.nodeId}`;
  if (request.stateSnapshotId) return `state:snapshot:${request.stateSnapshotId}`;
  if (request.timelineEntryId) return `state:timeline:${request.timelineEntryId}`;
  return `state:${request.nodeId ?? "workspace"}`;
}

function observedStateDetail<TState extends StateSnapshot>(
  recordingId: string,
  resolved: AutomationStateResolvedIndex,
  state: TState
): AutomationStateDetail<TState> {
  const sourceId = `observed:${recordingId}:${resolved.entryId}`;
  return {
    source: {
      kind: "observed",
      id: sourceId,
      label: `Recording ${shortId(recordingId)} @ ${shortId(resolved.entryId)}`,
      recordingId,
      timelineEntryId: resolved.entryId,
      timestamp: state.timestamp,
      stateSnapshotId: resolved.stateSnapshotId,
      stateRef: resolved.stateRef
    },
    snapshot: state,
    raw: { resolved, state }
  };
}

function compact<T>(value: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function shortId(value: string): string {
  return value.length <= 12 ? value : value.slice(-8);
}
