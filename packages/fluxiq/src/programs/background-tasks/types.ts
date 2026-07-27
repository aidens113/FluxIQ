import type { JsonObject } from "../../core";

export type BackgroundTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type BackgroundTaskDefinition = {
  id: string;
  name: string;
  schedule?: string;
  queue: string;
  enabled: boolean;
  metadata?: JsonObject;
};

export type BackgroundTaskRun = {
  id: string;
  taskId: string;
  status: BackgroundTaskStatus;
  queuedAtMs: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  error?: string;
  payload?: JsonObject;
};

export type BackgroundTasksSnapshot = {
  tasks: BackgroundTaskDefinition[];
  runs: BackgroundTaskRun[];
};
