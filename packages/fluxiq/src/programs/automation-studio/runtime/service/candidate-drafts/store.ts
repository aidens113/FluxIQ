import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord, AutomationStudioCandidateDraftReference, AutomationStudioCandidateDraftSourceRead } from "./record.ts";
import { AutomationStudioCandidateSource as Source } from "./source.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateOriginalSources } from "../../flow-bootstrap/candidate/index.ts";

/** Latest candidate per Flow. Reading a draft never grants execution or promotion. */
export class AutomationStudioFlowCandidateDraftStore {
  private readonly memory = new Map<string, AutomationStudioFlowCandidateDraftRecord>();
  constructor(private readonly paths: AutomationStudioProjectPaths, private readonly flows: AutomationStudioFlowPaths, private readonly projects: AutomationStudioProjectStore) {}

  async get(projectId: string, flowId: string): Promise<AutomationStudioFlowCandidateDraftRecord | undefined> {
    const held = this.memory.get(JSON.stringify([projectId, flowId]));
    if (held) return structuredClone(held);
    return this.getAuthoritative(projectId, flowId);
  }

  /** Bypass cached drafts for verification freshness. Memory-only is not durable authority. */
  async getAuthoritative(projectId: string, flowId: string): Promise<AutomationStudioFlowCandidateDraftRecord | undefined> {
    if (!this.paths.root) return undefined;
    const stored = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    // This is a storage discriminator, not a compiler/verification receipt.
    if (stored.kind !== "flow_candidate_draft" || (stored.schemaVersion !== 1 && stored.schemaVersion !== 2) || stored.status !== "draft" || stored.verification !== "not_performed" || stored.projectId !== projectId || stored.flowId !== flowId) return undefined;
    if (stored.schemaVersion === 2) {
      const parsed = Source.record(stored, projectId, flowId);
      return parsed.status === "valid" ? parsed.record : undefined;
    }
    const candidate = stored.candidate;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.status !== "draft" || typeof candidate.digest !== "string" || !/^[a-f0-9]{64}$/.test(candidate.digest) || !Number.isSafeInteger(candidate.revision) || Number(candidate.revision) < 1 || !candidate.buildPlan || typeof stored.candidateId !== "string" || !stored.candidateId) return undefined;
    if (Object.hasOwn(stored, "originalSources") || Object.hasOwn(stored, "originalInstructionsDigest") || Object.hasOwn(candidate, "fingerprintVersion") || Object.hasOwn(candidate, "originalInstructionsDigest")) return undefined;
    return structuredClone(stored) as unknown as AutomationStudioFlowCandidateDraftRecord;
  }

  /** Disk/current supplied bytes only; never a pin, interpretation or execution grant. */
  async getVerificationSource(input: { reference: AutomationStudioCandidateDraftReference; currentOriginalSources: AutomationStudioCandidateOriginalSources }): Promise<AutomationStudioCandidateDraftSourceRead> {
    try {
      if (!input || Object.getPrototypeOf(input) !== Object.prototype) return { status: "unknown", code: "candidate.source_request_invalid" };
      const descriptors = Object.getOwnPropertyDescriptors(input);
      if (Reflect.ownKeys(input).length !== 2 || !descriptors.reference || !Object.hasOwn(descriptors.reference, "value") || !descriptors.currentOriginalSources || !Object.hasOwn(descriptors.currentOriginalSources, "value")) return { status: "unknown", code: "candidate.source_request_invalid" };
      const reference = fingerprint.snapshot(descriptors.reference.value as AutomationStudioCandidateDraftReference);
      const keys = ["projectId", "flowId", "candidateId", "revision", "digest", "baseDependencyDigest", "baseSettingsRevision", "originalInstructionsDigest"];
      if (Object.keys(reference).length !== keys.length || keys.some(key => !Object.hasOwn(reference, key))
        || !Number.isSafeInteger(reference.revision) || reference.revision < 1 || !Number.isSafeInteger(reference.baseSettingsRevision) || reference.baseSettingsRevision < 0
        || [reference.projectId, reference.flowId, reference.candidateId, reference.baseDependencyDigest].some(value => typeof value !== "string" || !value || value.length > 200 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value))
        || [reference.digest, reference.originalInstructionsDigest].some(value => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))) return { status: "unknown", code: "candidate.source_reference_invalid" };
      const sources = fingerprint.snapshot(descriptors.currentOriginalSources.value as AutomationStudioCandidateOriginalSources);
      const current = Source.validate({ originalSources: sources, originalInstructionsDigest: fingerprint.source(sources) });
      if (!this.paths.root) return { status: "unknown", code: "candidate.source_memory_only" };
      const stored = await new ProgramJsonStore<JsonObject>(this.file(reference.projectId, reference.flowId), () => ({})).readExistingReadOnly();
      const parsed = Source.record(stored, reference.projectId, reference.flowId);
      if (parsed.status === "invalid") return { status: "unknown", code: parsed.code };
      const record = parsed.record;
      if (record.schemaVersion !== 2) return { status: "unknown", code: "candidate.source_unbound" };
      if (record.candidateId !== reference.candidateId || record.candidate.revision !== reference.revision || record.candidate.digest !== reference.digest
        || record.candidate.baseDependencyDigest !== reference.baseDependencyDigest || record.baseSettingsRevision !== reference.baseSettingsRevision
        || record.originalInstructionsDigest !== reference.originalInstructionsDigest || current.originalInstructionsDigest !== record.originalInstructionsDigest) return { status: "unknown", code: "candidate.source_stale" };
      return fingerprint.snapshot({ status: "bound" as const, record, originalInstructionsDigest: record.originalInstructionsDigest });
    } catch { return { status: "unknown", code: "candidate.source_unavailable" }; }
  }

  async save(record: AutomationStudioFlowCandidateDraftRecord, signal?: AbortSignal): Promise<AutomationStudioFlowCandidateDraftRecord> {
    signal?.throwIfAborted();
    const version = Object.getOwnPropertyDescriptor(record, "schemaVersion")?.value;
    if (version !== 1 && version !== 2) throw new Error("candidate.source_record_invalid");
    const snapshot = version === 2 ? fingerprint.snapshot(record) : structuredClone(record);
    if (snapshot.status !== "draft" || snapshot.verification !== "not_performed" || snapshot.candidate.status !== "draft") throw new Error("Candidate storage accepts unverified drafts only.");
    if (version === 2 ? Source.record(snapshot, snapshot.projectId, snapshot.flowId).status === "invalid"
      : version !== 1 || Object.hasOwn(snapshot, "originalSources") || Object.hasOwn(snapshot, "originalInstructionsDigest") || Object.hasOwn(snapshot.candidate, "fingerprintVersion") || Object.hasOwn(snapshot.candidate, "originalInstructionsDigest")) throw new Error("candidate.source_record_invalid");
    if (this.paths.root) {
      await this.projects.ensureProjectStructure(snapshot.projectId);
      signal?.throwIfAborted();
      await new ProgramJsonStore<JsonObject>(this.file(snapshot.projectId, snapshot.flowId), () => ({})).write(snapshot as unknown as JsonObject);
    }
    this.memory.set(JSON.stringify([snapshot.projectId, snapshot.flowId]), snapshot);
    return structuredClone(snapshot);
  }

  private file(projectId: string, flowId: string): string { return path.join(this.flows.flowDirectory(projectId, flowId), "candidate-draft.json"); }
}
