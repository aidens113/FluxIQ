import type { FrameworkResult, JsonObject } from "../../../core";
import type { AutomationTask, DynamicPolicyArtifact, RecordingEvent } from "../types";

export type AutomationStudioRuntimeContext = {
  domainId?: string | null;
  capabilities: Record<string, unknown>;
  variables: Record<string, unknown>;
};

export type AutomationStudioRecorder = {
  start(task: AutomationTask): Promise<void> | void;
  append(event: RecordingEvent): Promise<void> | void;
  stop(metadata?: JsonObject): Promise<void> | void;
};

export type PolicyRunner = {
  run(policy: DynamicPolicyArtifact, context: AutomationStudioRuntimeContext): Promise<FrameworkResult>;
};
