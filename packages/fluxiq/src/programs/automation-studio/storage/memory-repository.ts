import type { CanonicalAutomationStudioRepositories, AutomationStudioRepository } from "./contracts";
import type { AutomationStudioDocumentIdentity } from "./ids";
import {
  canonicalArtifactIdentity,
  learnedTaskModelDocumentId,
  normalizedTimelineDocumentId,
  policyGraphDocumentId,
  recordingSessionDocumentId,
  signalRegistryDocumentId
} from "./ids";
import type { LearnedTaskModel } from "../learning";
import type { NormalizedTimeline } from "../normalization";
import type { PolicyGraph, RecordingSession, SignalRegistry } from "../model";

export type AutomationStudioMemoryRepositoryOptions<TDocument> = {
  identify(document: TDocument): AutomationStudioDocumentIdentity;
};

export class AutomationStudioMemoryRepository<TDocument> implements AutomationStudioRepository<TDocument> {
  private readonly documents = new Map<string, TDocument>();
  private readonly identities = new Map<string, AutomationStudioDocumentIdentity>();
  private readonly identify: (document: TDocument) => AutomationStudioDocumentIdentity;

  constructor(options: AutomationStudioMemoryRepositoryOptions<TDocument>) {
    this.identify = options.identify;
  }

  async list(domainId?: string | null): Promise<TDocument[]> {
    const documents: TDocument[] = [];
    for (const [id, document] of this.documents) {
      const identity = this.identities.get(id);
      if (domainId === undefined || identity?.domainId === domainId) {
        documents.push(cloneDocument(document));
      }
    }
    return documents;
  }

  async get(id: string, domainId?: string | null): Promise<TDocument | null> {
    const identity = this.identities.get(id);
    if (!identity || (domainId !== undefined && identity.domainId !== domainId)) return null;
    const document = this.documents.get(id);
    return document ? cloneDocument(document) : null;
  }

  async put(document: TDocument): Promise<TDocument> {
    const identity = this.identify(document);
    this.documents.set(identity.id, cloneDocument(document));
    this.identities.set(identity.id, identity);
    return cloneDocument(document);
  }

  async delete(id: string, domainId?: string | null): Promise<boolean> {
    const identity = this.identities.get(id);
    if (!identity || (domainId !== undefined && identity.domainId !== domainId)) return false;
    this.identities.delete(id);
    return this.documents.delete(id);
  }
}

export function createCanonicalAutomationStudioMemoryRepositories(): CanonicalAutomationStudioRepositories {
  return {
    recordingSessions: new AutomationStudioMemoryRepository<RecordingSession>({
      identify: (document) => ({
        ...canonicalArtifactIdentity(document),
        id: recordingSessionDocumentId(document)
      })
    }),
    normalizedTimelines: new AutomationStudioMemoryRepository<NormalizedTimeline>({
      identify: (document) => ({
        ...canonicalArtifactIdentity(document),
        id: normalizedTimelineDocumentId(document)
      })
    }),
    signalRegistries: new AutomationStudioMemoryRepository<SignalRegistry>({
      identify: (document) => ({
        ...canonicalArtifactIdentity(document),
        id: signalRegistryDocumentId(document)
      })
    }),
    learnedTaskModels: new AutomationStudioMemoryRepository<LearnedTaskModel>({
      identify: (document) => ({
        ...canonicalArtifactIdentity(document),
        id: learnedTaskModelDocumentId(document)
      })
    }),
    policyGraphs: new AutomationStudioMemoryRepository<PolicyGraph>({
      identify: (document) => ({
        ...canonicalArtifactIdentity(document),
        id: policyGraphDocumentId(document)
      })
    })
  };
}

function cloneDocument<TDocument>(document: TDocument): TDocument {
  return structuredClone(document);
}
