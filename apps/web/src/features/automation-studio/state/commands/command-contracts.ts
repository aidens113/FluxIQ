import { automationStudioViewId } from "../../views/view-registry";
import type { NodeStatePhase, NodeStateSource, StateSnapshot } from "fluxiq/automation-studio";
import type { AutomationProjectApi } from "../../project/project-api";
import type { AutomationSelection } from "../../shared/selection-contracts";

export type AutomationStateCommandScope = {
  projectId: string;
  generation: number;
};

export type AutomationStateCommandOutcome<T> =
  | { status: "success"; value: T }
  | { status: "failure"; error: string; code?: string }
  | { status: "cancelled"; reason: string }
  | { status: "stale"; reason: string };

export type AutomationStateScopeGuard = {
  isCurrent(scope: AutomationStateCommandScope): boolean;
};

export type AutomationStateCommandCapabilities = AutomationStateScopeGuard & {
  api: Pick<AutomationProjectApi, "post">;
};

export type AutomationStateViewRequest = {
  nodeId?: string;
  flowId?: string;
  sourceId?: string;
  phase?: NodeStatePhase;
  evidenceId?: string;
  factPath?: string;
  proposalId?: string;
  recordingId?: string;
  timelineEntryId?: string;
  stateSnapshotId?: string;
  stateRef?: string;
};

export type AutomationStateLoadingIntent = {
  kind: "intent";
  scope: AutomationStateCommandScope;
  requestKey: string;
  viewId: typeof automationStudioViewId.state;
  loading: boolean;
  selection: Extract<AutomationSelection, { kind: "state" }>;
};

export type AutomationStateResolvedIndex = {
  stateSnapshotId: string;
  entryId: string;
  stateRef: string;
  screenshotRef?: string;
};

export type AutomationObservedStateSource = Extract<NodeStateSource, { kind: "observed" }> & {
  stateSnapshotId: string;
  stateRef: string;
};

export type AutomationStateDetail<TState extends StateSnapshot = StateSnapshot> = {
  source: AutomationObservedStateSource;
  snapshot: TState;
  raw: {
    resolved: AutomationStateResolvedIndex;
    state: TState;
  };
};

export type AutomationStateResolvedPublication<TState extends StateSnapshot = StateSnapshot> = {
  kind: "resolved";
  scope: AutomationStateCommandScope;
  requestKey: string;
  selection: Extract<AutomationSelection, { kind: "state" }>;
  resolved: AutomationStateResolvedIndex | null;
  detail: AutomationStateDetail<TState> | null;
};

export type AutomationStateFailurePublication = {
  kind: "failure";
  scope: AutomationStateCommandScope;
  requestKey: string;
  error: string;
};

export type AutomationStatePublication<TState extends StateSnapshot = StateSnapshot> =
  | AutomationStateLoadingIntent
  | AutomationStateResolvedPublication<TState>
  | AutomationStateFailurePublication;

export type AutomationStatePublisher<TState extends StateSnapshot = StateSnapshot> = {
  publish(event: AutomationStatePublication<TState>): void;
  yieldToDetail?(): Promise<void>;
};

export const AUTOMATION_STATE_ENDPOINTS = {
  recordingEntry: "get-recording-entry-state",
  snapshot: "get-state-snapshot"
} as const;

export function stateCommandPreflight<T>(
  scope: AutomationStateCommandScope,
  guard: AutomationStateScopeGuard,
  signal?: AbortSignal
): AutomationStateCommandOutcome<T> | null {
  if (signal?.aborted) return { status: "cancelled", reason: "The State command was cancelled." };
  if (!guard.isCurrent(scope)) return { status: "stale", reason: "The active project changed before the State command started." };
  return null;
}

export function stateCommandPostflight<T>(
  scope: AutomationStateCommandScope,
  guard: AutomationStateScopeGuard,
  signal?: AbortSignal
): AutomationStateCommandOutcome<T> | null {
  if (signal?.aborted) return { status: "cancelled", reason: "The State command was cancelled." };
  if (!guard.isCurrent(scope)) return { status: "stale", reason: "The State command completed for an inactive project generation." };
  return null;
}

export function stateCommandRequestFailure<T>(response: { aborted?: boolean; error?: string }, fallback: string): AutomationStateCommandOutcome<T> {
  return response.aborted
    ? { status: "cancelled", reason: response.error ?? "The State request was cancelled." }
    : { status: "failure", error: response.error ?? fallback };
}

export function stateCommandThrownFailure<T>(error: unknown, signal: AbortSignal | undefined, fallback: string): AutomationStateCommandOutcome<T> {
  if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return { status: "cancelled", reason: "The State request was cancelled." };
  }
  return { status: "failure", error: error instanceof Error ? error.message : fallback };
}
