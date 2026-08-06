import type { JsonObject } from "../../../core/index.ts";
import { SQLiteRepository, createRecord } from "../../database-manager/storage/sqlite-repository.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import type { PolicyGraph, RecordingSession, SignalRegistry } from "../model/index.ts";
import type { AutomationStudioDocumentIdentity } from "./ids.ts";
import {
  canonicalArtifactIdentity,
  learnedTaskModelDocumentId,
  normalizedTimelineDocumentId,
  policyGraphDocumentId,
  recordingSessionDocumentId,
  signalRegistryDocumentId
} from "./ids.ts";
import type { AutomationStudioRepository, CanonicalAutomationStudioRepositories } from "./contracts.ts";

class AutomationStudioSQLiteRepository<TDocument> implements AutomationStudioRepository<TDocument> {
  private readonly repository: SQLiteRepository<JsonObject>;

  constructor(rootDir: string, kind: string, private readonly identify: (document: TDocument) => AutomationStudioDocumentIdentity) {
    this.repository = new SQLiteRepository({ rootDir, kind, layoutVersion: 2 });
  }

  async list(domainId?: string | null): Promise<TDocument[]> {
    const records = await this.repository.list();
    return records
      .map((record) => record.data.document as unknown as TDocument)
      .filter((document) => domainId === undefined || this.identify(document).domainId === domainId)
      .map((document) => structuredClone(document));
  }

  async get(id: string, domainId?: string | null): Promise<TDocument | null> {
    const record = await this.repository.get(id);
    if (!record) return null;
    const document = record.data.document as unknown as TDocument;
    if (domainId !== undefined && this.identify(document).domainId !== domainId) return null;
    return structuredClone(document);
  }

  async put(document: TDocument): Promise<TDocument> {
    const identity = this.identify(document);
    await this.repository.put(createRecord({
      id: identity.id,
      kind: this.repository.kind,
      data: { document: document as unknown as JsonObject, domainId: identity.domainId ?? null }
    }));
    return structuredClone(document);
  }

  async delete(id: string, domainId?: string | null): Promise<boolean> {
    if (domainId !== undefined) {
      const current = await this.get(id, domainId);
      if (!current) return false;
    }
    return this.repository.delete(id);
  }
}

export function createCanonicalAutomationStudioSQLiteRepositories(rootDir: string): CanonicalAutomationStudioRepositories {
  return {
    recordingSessions: new AutomationStudioSQLiteRepository<RecordingSession>(rootDir, "automation.recording_sessions", (document) => ({ ...canonicalArtifactIdentity(document), id: recordingSessionDocumentId(document) })),
    normalizedTimelines: new AutomationStudioSQLiteRepository<NormalizedTimeline>(rootDir, "automation.normalized_timelines", (document) => ({ ...canonicalArtifactIdentity(document), id: normalizedTimelineDocumentId(document) })),
    signalRegistries: new AutomationStudioSQLiteRepository<SignalRegistry>(rootDir, "automation.signal_registries", (document) => ({ ...canonicalArtifactIdentity(document), id: signalRegistryDocumentId(document) })),
    learnedTaskModels: new AutomationStudioSQLiteRepository<LearnedTaskModel>(rootDir, "automation.learned_task_models", (document) => ({ ...canonicalArtifactIdentity(document), id: learnedTaskModelDocumentId(document) })),
    policyGraphs: new AutomationStudioSQLiteRepository<PolicyGraph>(rootDir, "automation.policy_graphs", (document) => ({ ...canonicalArtifactIdentity(document), id: policyGraphDocumentId(document) }))
  };
}
