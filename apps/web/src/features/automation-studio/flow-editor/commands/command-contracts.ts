import type { AutomationProjectApi } from "../../project/project-api";

export type AutomationFlowCommandScope = {
  projectId: string;
  generation: number;
};

export type AutomationFlowCommandOutcome<T> =
  | { status: "success"; value: T }
  | { status: "failure"; error: string; code?: string }
  | { status: "cancelled"; reason: string }
  | { status: "stale"; reason: string };

export type AutomationFlowScopeGuard = {
  isCurrent(scope: AutomationFlowCommandScope): boolean;
};

export type AutomationFlowCommandCapabilities = AutomationFlowScopeGuard & {
  api: Pick<AutomationProjectApi, "post">;
};

export const AUTOMATION_FLOW_ENDPOINTS = {
  detail: "get-graph-viewport",
  nativeNodeDefinitions: "list-native-node-definitions",
  publishedFlowNodes: "list-published-flow-nodes",
  run: "run-runtime-session",
  applyGraphPatch: "apply-graph-patch",
  publish: "publish-flow",
  deprecate: "deprecate-flow-publication",
  subflow: "get-flow-subflow"
} as const;

export function flowCommandPreflight<T>(
  scope: AutomationFlowCommandScope,
  guard: AutomationFlowScopeGuard,
  signal?: AbortSignal
): AutomationFlowCommandOutcome<T> | null {
  if (signal?.aborted) return { status: "cancelled", reason: "The Flow command was cancelled." };
  if (!guard.isCurrent(scope)) return { status: "stale", reason: "The active project changed before the Flow command started." };
  return null;
}

export function flowCommandPostflight<T>(
  scope: AutomationFlowCommandScope,
  guard: AutomationFlowScopeGuard,
  signal?: AbortSignal
): AutomationFlowCommandOutcome<T> | null {
  if (signal?.aborted) return { status: "cancelled", reason: "The Flow command was cancelled." };
  if (!guard.isCurrent(scope)) return { status: "stale", reason: "The Flow command completed for an inactive project generation." };
  return null;
}

export function flowCommandRequestFailure<T>(response: { aborted?: boolean; error?: string }, fallback: string): AutomationFlowCommandOutcome<T> {
  return response.aborted
    ? { status: "cancelled", reason: response.error ?? "The Flow request was cancelled." }
    : { status: "failure", error: response.error ?? fallback };
}

export function flowCommandThrownFailure<T>(error: unknown, signal: AbortSignal | undefined, fallback: string): AutomationFlowCommandOutcome<T> {
  if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return { status: "cancelled", reason: "The Flow request was cancelled." };
  }
  return { status: "failure", error: error instanceof Error ? error.message : fallback };
}
