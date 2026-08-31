import {
  automationEntityCollectionSelector,
  type AutomationProjectEntityKind,
  type AutomationStudioStores
} from "../stores";

export type AutomationSessionStoreSetter<Value> = (
  next: Value | ((current: Value) => Value)
) => void;

export function createAutomationSessionStoreCommands(stores: AutomationStudioStores) {
  const resource = <Value,>(key: string): AutomationSessionStoreSetter<Value> => (next) => {
    const current = stores.projectData.getState().resources.get(key) as Value;
    stores.projectData.setResource(
      key,
      typeof next === "function" ? (next as (value: Value) => Value)(current) : next
    );
  };
  const entities = <Value,>(
    kind: AutomationProjectEntityKind,
    identify: (value: Value, index: number) => string
  ): AutomationSessionStoreSetter<Value[]> => (next) => {
    const current = automationEntityCollectionSelector(kind)(stores.projectData.getState()) as Value[];
    const value = typeof next === "function" ? next(current) : next;
    stores.projectData.replaceAll(kind, value.map((item, index) => [identify(item, index), item]));
  };
  return {
    resource,
    entities,
    selection: createSelectionSetter(stores, "selection"),
    pendingStateOpen: createSelectionSetter(stores, "pendingStateOpen"),
    bottomPreview: createSelectionSetter(stores, "bottomPreviewEntryId"),
    recordingPrimaryKind: createSelectionSetter(stores, "recordingPrimaryKind"),
    actionStatus: createRuntimeSetter(stores, "actionStatus"),
    flowRunState: createRuntimeSetter(stores, "flowRunState"),
    recordingProcessing: createRuntimeSetter(stores, "recordingProcessing")
  };
}

function createSelectionSetter(stores: AutomationStudioStores, key: string): AutomationSessionStoreSetter<any> {
  return (next) => {
    const state = stores.selection.getState() as any;
    const value = typeof next === "function" ? next(state[key]) : next;
    if (key === "selection") stores.selection.select(value);
    else if (key === "pendingStateOpen") stores.selection.requestStateOpen(value);
    else if (key === "bottomPreviewEntryId") stores.selection.setBottomPreview(value);
    else stores.selection.setRecordingPrimaryKind(value);
  };
}

function createRuntimeSetter(stores: AutomationStudioStores, key: string): AutomationSessionStoreSetter<any> {
  return (next) => {
    const state = stores.runtimeStatus.getState() as any;
    const value = typeof next === "function" ? next(state[key]) : next;
    if (key === "actionStatus") stores.runtimeStatus.setActionStatus(value);
    else if (key === "flowRunState") stores.runtimeStatus.setFlowRunState(value);
    else stores.runtimeStatus.setRecordingProcessing(value);
  };
}

export const automationFlowEntryId = (value: any, index: number) => String(
  value?.flow?.flowId ?? value?.flowId ?? value?.id ?? `index:${index}`
);
export const automationRecordingId = (value: any, index: number) => String(
  value?.recordingId ?? value?.id ?? `index:${index}`
);
export const automationTimelineId = (value: any, index: number) => String(
  value?.normalizedTimelineId ?? value?.id ?? `index:${index}`
);
export const automationRunId = (value: any, index: number) => String(
  value?.runId ?? value?.id ?? `index:${index}`
);
