"use client";

import { useCallback } from "react";
import type { RecordingProcessingStatus } from "../shared/recording-processing-status";
import type { AutomationStudioStores } from "../stores/studio-stores";
import type { AutomationStoreSetter } from "../stores/use-project-data-resource";
import { useAutomationStoreSelector } from "../stores/use-store-selector";
import type { AutomationFlowRunState } from "./flow-run-status";

export function useAutomationRuntimeStatusState(stores: AutomationStudioStores) {
  const automationActionStatus = useAutomationStoreSelector(stores.runtimeStatus, (state) => state.actionStatus, "action-status");
  const flowRunState = useAutomationStoreSelector(stores.runtimeStatus, (state) => state.flowRunState as AutomationFlowRunState, "flow-run");
  const recordingProcessing = useAutomationStoreSelector(stores.runtimeStatus, (state) => state.recordingProcessing as RecordingProcessingStatus | null, "recording-processing");
  return {
    automationActionStatus, setAutomationActionStatus: useRuntimeSetter<string>(stores, "actionStatus"),
    flowRunState, setFlowRunState: useRuntimeSetter<AutomationFlowRunState>(stores, "flowRunState"),
    recordingProcessing, setRecordingProcessing: useRuntimeSetter<RecordingProcessingStatus | null>(stores, "recordingProcessing")
  };
}

function useRuntimeSetter<Value>(
  stores: AutomationStudioStores,
  key: "actionStatus" | "flowRunState" | "recordingProcessing"
): AutomationStoreSetter<Value> {
  return useCallback((next) => {
    const current = stores.runtimeStatus.getState()[key] as Value;
    const value = typeof next === "function" ? (next as (current: Value) => Value)(current) : next;
    if (key === "actionStatus") stores.runtimeStatus.setActionStatus(value as string);
    else if (key === "flowRunState") stores.runtimeStatus.setFlowRunState(value);
    else stores.runtimeStatus.setRecordingProcessing(value);
  }, [key, stores]);
}