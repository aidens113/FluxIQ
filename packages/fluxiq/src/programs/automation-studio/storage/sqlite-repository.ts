import type { JsonObject } from "../../../core/index.ts";
import { SQLiteRepository, createRecord } from "../../database-manager/storage/sqlite-repository.ts";
import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowMigrationLedger, AutomationStudioFlowPublicationRecord, PolicyGraph, RecordingSession, SignalRegistry } from "../model/index.ts";
import type { AutomationStudioDocumentIdentity } from "./ids.ts";
import {
  canonicalArtifactIdentity,
  learnedTaskModelDocumentId,
  normalizedTimelineDocumentId,
  policyGraphDocumentId,
  recordingSessionDocumentId,
  signalRegistryDocumentId
} from "./ids.ts";
import type { AutomationStudioRepository, CanonicalAutomationStudioRepositories, CanonicalAutomationStudioSQLiteOptions } from "./contracts.ts";
import { CanonicalAuthorityRepository, CanonicalAuthorityWholeOperation, CanonicalAuthorityValidation as V } from "./canonical-authority/index.ts";
import path from "node:path";

const factoryBindings = new WeakMap<object, { rootDir: string; members: Readonly<CanonicalAutomationStudioRepositories> }>();

/** Internal read-only provenance; shaped/custom bundles cannot obtain factory membership. */
export function canonicalAutomationStudioSQLiteFactoryRoot(bundle: CanonicalAutomationStudioRepositories): string {
  const binding = factoryBindings.get(bundle);
  if (!binding || Object.getOwnPropertySymbols(bundle).length || Object.keys(bundle).sort().join("|") !== Object.keys(binding.members).sort().join("|")) throw new Error("canonical_whole.factory_provenance");
  const descriptors = Object.getOwnPropertyDescriptors(bundle);
  if (Object.entries(binding.members).some(([key, member]) => !("value" in descriptors[key]!) || descriptors[key]!.value !== member)) throw new Error("canonical_whole.factory_provenance");
  return binding.rootDir;
}

class AutomationStudioSQLiteRepository<TDocument> implements AutomationStudioRepository<TDocument> {
  private readonly repository: SQLiteRepository<JsonObject>;
  private readonly authority: CanonicalAuthorityRepository | undefined;
  private readonly strictDocument: boolean;

  constructor(rootDir: string, kind: string, private readonly identify: (document: TDocument) => AutomationStudioDocumentIdentity, options?: CanonicalAutomationStudioSQLiteOptions) {
    this.repository = new SQLiteRepository({ rootDir, kind, layoutVersion: 2 });
    if (kind === "automation.flows" || kind === "automation.flow_publications") this.authority = new CanonicalAuthorityRepository(rootDir, kind, options?.canonicalRouting);
    this.strictDocument = Boolean(this.authority && options?.canonicalRouting);
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
    const frozen = this.strictDocument || CanonicalAuthorityWholeOperation.current(this.repository.rootDir) ? V.clone(document) : structuredClone(document), identity = this.identify(frozen);
    const legacy = async () => { await this.repository.put(createRecord({
      id: identity.id,
      kind: this.repository.kind,
      data: { document: frozen as unknown as JsonObject, domainId: identity.domainId ?? null }
    })); };
    if (this.authority) await this.authority.route("put", identity.id, frozen as unknown as JsonObject, identity.domainId); else await legacy();
    return structuredClone(frozen);
  }

  async delete(id: string, domainId?: string | null): Promise<boolean> {
    if (this.authority) return this.authority.route("delete", id, null, domainId);
    if (domainId !== undefined) {
      const current = await this.get(id, domainId);
      if (!current) return false;
    }
    return this.repository.delete(id);
  }
}

export function createCanonicalAutomationStudioSQLiteRepositories(rootDir: string, options?: CanonicalAutomationStudioSQLiteOptions): CanonicalAutomationStudioRepositories {
  if (options !== undefined) {
    V.closed(options, Object.hasOwn(options, "canonicalRouting") ? ["canonicalRouting"] : []);
    if (options.canonicalRouting !== undefined) options = { canonicalRouting: V.options(options.canonicalRouting) };
  }
  const bundle: CanonicalAutomationStudioRepositories = {
    flows: new AutomationStudioSQLiteRepository<AutomationStudioFlowArtifact>(rootDir, "automation.flows", (document) => ({ ...canonicalArtifactIdentity(document), id: document.flowId }), options),
    flowPublications: new AutomationStudioSQLiteRepository<AutomationStudioFlowPublicationRecord>(rootDir, "automation.flow_publications", (document) => ({ ...canonicalArtifactIdentity(document), id: document.publicationId }), options),
    flowMigrationLedgers: new AutomationStudioSQLiteRepository<AutomationStudioFlowMigrationLedger>(rootDir, "automation.flow_migration_ledgers", (document) => ({ ...canonicalArtifactIdentity(document), id: document.migrationId })),
    recordingSessions: new AutomationStudioSQLiteRepository<RecordingSession>(rootDir, "automation.recording_sessions", (document) => ({ ...canonicalArtifactIdentity(document), id: recordingSessionDocumentId(document) })),
    normalizedTimelines: new AutomationStudioSQLiteRepository<NormalizedTimeline>(rootDir, "automation.normalized_timelines", (document) => ({ ...canonicalArtifactIdentity(document), id: normalizedTimelineDocumentId(document) })),
    signalRegistries: new AutomationStudioSQLiteRepository<SignalRegistry>(rootDir, "automation.signal_registries", (document) => ({ ...canonicalArtifactIdentity(document), id: signalRegistryDocumentId(document) })),
    learnedTaskModels: new AutomationStudioSQLiteRepository<LearnedTaskModel>(rootDir, "automation.learned_task_models", (document) => ({ ...canonicalArtifactIdentity(document), id: learnedTaskModelDocumentId(document) })),
    policyGraphs: new AutomationStudioSQLiteRepository<PolicyGraph>(rootDir, "automation.policy_graphs", (document) => ({ ...canonicalArtifactIdentity(document), id: policyGraphDocumentId(document) }))
  };
  factoryBindings.set(bundle, { rootDir: path.resolve(rootDir), members: Object.freeze({ ...bundle }) });
  return bundle;
}
