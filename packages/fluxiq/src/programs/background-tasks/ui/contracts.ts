export type BackgroundTasksPanel = "tasks" | "runs" | "schedules";

export type BackgroundTasksViewState = {
  activePanel: BackgroundTasksPanel;
  selectedTaskId?: string;
  selectedRunId?: string;
};
