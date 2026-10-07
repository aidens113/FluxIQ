import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "./record.ts";

/** Latest candidate per Flow. Reading a draft never grants execution or promotion. */
export class AutomationStudioFlowCandidateDraftStore {
  private readonly memory = new Map<string, AutomationStudioFlowCandidateDraftRecord>();
  constructor(private readonly paths: AutomationStudioProjectPaths, private readonly flows: AutomationStudioFlowPaths, private readonly projects: AutomationStudioProjectStore) {}

  async get(projectId: string, flowId: string): Promise<AutomationStudioFlowCandidateDraftRecord | undefined> {
    const held = this.memory.get(JSON.stringify([projectId, flowId]));
    if (held) return structuredClone(held);
    if (!this.paths.root) return undefined;
    const stored = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    // This is a storage discriminator, not a compiler/verification receipt.
    if (stored.kind !== "flow_candidate_draft" || stored.schemaVersion !== 1 || stored.status !== "draft" || stored.verification !== "not_performed" || stored.projectId !== projectId || stored.flowId !== flowId) return undefined;
    const candidate = stored.candidate;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.status !== "draft" || typeof candidate.digest !== "string" || !/^[a-f0-9]{64}$/.test(candidate.digest) || !Number.isSafeInteger(candidate.revision) || Number(candidate.revision) < 1 || !candidate.buildPlan || typeof stored.candidateId !== "string" || !stored.candidateId) return undefined;
    return structuredClone(stored) as unknown as AutomationStudioFlowCandidateDraftRecord;
  }

  async save(record: AutomationStudioFlowCandidateDraftRecord, signal?: AbortSignal): Promise<AutomationStudioFlowCandidateDraftRecord> {
    signal?.throwIfAborted();
    const snapshot = structuredClone(record);
    if (snapshot.status !== "draft" || snapshot.verification !== "not_performed" || snapshot.candidate.status !== "draft") throw new Error("Candidate storage accepts unverified drafts only.");
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
