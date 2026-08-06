import type { BackgroundTaskDefinition, BackgroundTaskRun } from "../types.ts";

export type BackgroundTasksStore = {
  listTasks(): Promise<BackgroundTaskDefinition[]>;
  saveTask(task: BackgroundTaskDefinition): Promise<BackgroundTaskDefinition>;
  listRuns(taskId?: string): Promise<BackgroundTaskRun[]>;
  saveRun(run: BackgroundTaskRun): Promise<BackgroundTaskRun>;
};
