export type AutomationFlowRunState = {
  phase: "idle" | "starting" | "succeeded" | "failed";
  message: string;
  runId?: string;
  flowId?: string;
  status?: string;
  startedAt?: number;
  finishedAt?: number;
};