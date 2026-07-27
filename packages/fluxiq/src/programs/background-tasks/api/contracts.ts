import type { JsonObject } from "../../../core";
import type { BackgroundTaskRun, BackgroundTasksSnapshot } from "../types";

export const BACKGROUND_TASKS_ENDPOINTS = {
  snapshot: "snapshot",
  run: "run",
  setEnabled: "set-enabled"
} as const;

export type RunBackgroundTaskRequest = {
  taskId: string;
  payload?: JsonObject;
};

export type RunBackgroundTaskResponse = BackgroundTaskRun;

export type SetBackgroundTaskEnabledRequest = {
  taskId: string;
  enabled: boolean;
};

export type BackgroundTasksSnapshotResponse = BackgroundTasksSnapshot;
