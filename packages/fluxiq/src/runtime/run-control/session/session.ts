import type { AutomationStudioRuntimeSessionStatus } from "./index.ts";
import type { AutomationStudioFlowDocument } from "../../../flows/authoring/legacy-artifact/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../../engine/automation/index.ts";
import type { JsonObject } from "../../../core/index.ts";

export type AutomationStudioRuntimeSession = {
  schemaVersion: "0.1";
  runId: string;
  projectId?: string | null;
  targetKind: "task" | "routine" | "flow";
  targetId: string;
  flowId: string;
  status: AutomationStudioRuntimeSessionStatus;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  flow: AutomationStudioFlowDocument;
  trace?: AutomationStudioGraphExecutionTrace;
  metadata?: JsonObject;
};

