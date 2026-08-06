import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import type { PolicyGraph, RecordingSession, SignalRegistry } from "../model/index.ts";

export type AutomationStudioRepository<TDocument> = {
  list(domainId?: string | null): Promise<TDocument[]>;
  get(id: string, domainId?: string | null): Promise<TDocument | null>;
  put(document: TDocument): Promise<TDocument>;
  delete(id: string, domainId?: string | null): Promise<boolean>;
};

export type AutomationStudioRepositories = {
  tasks: AutomationStudioRepository<AutomationTask>;
  recordings: AutomationStudioRepository<AutomationRecording>;
  policies: AutomationStudioRepository<DynamicPolicyArtifact>;
};

export type CanonicalAutomationStudioRepositories = {
  recordingSessions: AutomationStudioRepository<RecordingSession>;
  normalizedTimelines: AutomationStudioRepository<NormalizedTimeline>;
  signalRegistries: AutomationStudioRepository<SignalRegistry>;
  learnedTaskModels: AutomationStudioRepository<LearnedTaskModel>;
  policyGraphs: AutomationStudioRepository<PolicyGraph>;
};
