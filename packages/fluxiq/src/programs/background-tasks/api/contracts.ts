import type { JsonObject } from "../../../core";
import type { BackgroundTaskRun, BackgroundTasksSnapshot } from "../types";

export const BACKGROUND_TASKS_ENDPOINTS = {
  snapshot: "snapshot",
  detail: "detail",
  run: "run",
  setEnabled: "set-enabled",
  saveSchedule: "save-schedule",
  control: "control"
} as const;

export type RunBackgroundTaskRequest = {
  taskId: string;
  payload?: JsonObject;
};

export type BackgroundTaskDetailRequest = {
  taskId: string;
  limit?: number;
};

export type RunBackgroundTaskResponse = BackgroundTaskRun;

export type SetBackgroundTaskEnabledRequest = {
  taskId: string;
  enabled: boolean;
};

export type SaveBackgroundTaskScheduleRequest = {
  taskId: string;
  enabled?: boolean;
  intervalMs?: number;
  schedule?: string;
  metadata?: JsonObject;
};

export type ControlBackgroundTaskRequest = {
  action: "start" | "stop";
};

export type BackgroundTasksSnapshotResponse = BackgroundTasksSnapshot;
