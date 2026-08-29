import { createScopedExternalStore, type ScopedExternalStore } from "./external-store";

export type AutomationRuntimeCommandStatus = {
  id: string;
  state: "idle" | "running" | "success" | "error";
  detail: string;
  startedAt?: number;
  finishedAt?: number;
};

export type AutomationRuntimeStatusState = {
  commands: ReadonlyMap<string, AutomationRuntimeCommandStatus>;
  actionStatus: string;
  flowRunState: unknown;
  recordingProcessing: unknown | null;
};

export type AutomationRuntimeStatusStore = ScopedExternalStore<AutomationRuntimeStatusState> & {
  set(status: AutomationRuntimeCommandStatus): boolean;
  clear(id: string): boolean;
  setActionStatus(status: string): boolean;
  setFlowRunState(state: unknown): boolean;
  setRecordingProcessing(state: unknown | null): boolean;
};

export function createAutomationRuntimeStatusStore(initial: AutomationRuntimeStatusState = {
  commands: new Map(),
  actionStatus: "",
  flowRunState: { phase: "idle", message: "Ready." },
  recordingProcessing: null
}): AutomationRuntimeStatusStore {
  const store = createScopedExternalStore(initial);
  return {
    ...store,
    set(status) {
      const current = store.getState();
      const previous = current.commands.get(status.id);
      if (previous && sameStatus(previous, status)) return false;
      return store.replace({ ...current, commands: new Map(current.commands).set(status.id, status) }, [`command:${status.id}`, "commands"]);
    },
    clear(id) {
      const current = store.getState();
      if (!current.commands.has(id)) return false;
      const commands = new Map(current.commands);
      commands.delete(id);
      return store.replace({ ...current, commands }, [`command:${id}`, "commands"]);
    },
    setActionStatus: (actionStatus) => store.update((current) => current.actionStatus === actionStatus ? current : { ...current, actionStatus }, ["action-status"]),
    setFlowRunState: (flowRunState) => store.update((current) => Object.is(current.flowRunState, flowRunState) ? current : { ...current, flowRunState }, ["flow-run"]),
    setRecordingProcessing: (recordingProcessing) => store.update((current) => Object.is(current.recordingProcessing, recordingProcessing) ? current : { ...current, recordingProcessing }, ["recording-processing"])
  };
}

function sameStatus(left: AutomationRuntimeCommandStatus, right: AutomationRuntimeCommandStatus): boolean {
  return left.id === right.id
    && left.state === right.state
    && left.detail === right.detail
    && left.startedAt === right.startedAt
    && left.finishedAt === right.finishedAt;
}
