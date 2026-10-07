import type { AutomationRecording, AutomationTask, DynamicPolicyArtifact } from "../types.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowMigrationLedger, AutomationStudioFlowPublicationRecord, PolicyGraph, RecordingSession, SignalRegistry } from "../model/index.ts";
import type { CanonicalAuthorityOptions } from "./canonical-authority/index.ts";

export type CanonicalAutomationStudioSQLiteOptions = { canonicalRouting?: CanonicalAuthorityOptions };

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
  flows: AutomationStudioRepository<AutomationStudioFlowArtifact>;
  flowPublications: AutomationStudioRepository<AutomationStudioFlowPublicationRecord>;
  flowMigrationLedgers: AutomationStudioRepository<AutomationStudioFlowMigrationLedger>;
  recordingSessions: AutomationStudioRepository<RecordingSession>;
  normalizedTimelines: AutomationStudioRepository<NormalizedTimeline>;
  signalRegistries: AutomationStudioRepository<SignalRegistry>;
  learnedTaskModels: AutomationStudioRepository<LearnedTaskModel>;
  policyGraphs: AutomationStudioRepository<PolicyGraph>;
};
