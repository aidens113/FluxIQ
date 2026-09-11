import { createHash, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import { AutomationStudioLegacyWriteDisabledError, type AutomationStudioConfigArtifact, type AutomationStudioFlowDocument, type AutomationStudioLegacyBackup, type AutomationStudioLegacyRetirementAuditEvent, type AutomationStudioLegacyRetirementDiagnostic, type AutomationStudioLegacyRetirementState, type AutomationStudioProjectArtifacts, type AutomationStudioRoutineArtifact, type AutomationStudioTaskArtifact } from "../../../model/index.ts";
import type { AutomationStudioObjectStore } from "../../../storage/index.ts";
import { projectArtifactDocumentFileName, type AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import { stableJson } from "../stable-json.ts";

// The legacy Task/Routine retirement subsystem: the per-project retirement
// state, its audit trail, the source backups taken before a migration, and the
// reader for the legacy artifact folders those backups are built from. Every
// piece of it falls back to memory when the service has no storage root, which
// is why the three maps live here and nowhere else.
export class AutomationStudioLegacyRetirementStore {
  private readonly memoryLegacyRetirementStates = new Map<string, AutomationStudioLegacyRetirementState>();
  private readonly memoryLegacyBackups = new Map<string, AutomationStudioLegacyBackup>();
  private readonly memoryLegacyAudit = new Map<string, AutomationStudioLegacyRetirementAuditEvent[]>();
  private readonly legacyProjectArtifactReads = new Map<string, Promise<AutomationStudioProjectArtifacts>>();

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly projects: AutomationStudioProjectStore,
    private readonly objectStore?: AutomationStudioObjectStore
  ) {}

  async assertLegacyWriteAllowed(projectId: string): Promise<void> {
    const state = await this.readLegacyRetirementState(projectId);
    if (state.phase === "write_locked") throw new AutomationStudioLegacyWriteDisabledError(legacyDiagnostic(state));
  }

  async readLegacyRetirementState(projectId: string): Promise<AutomationStudioLegacyRetirementState> {
    await this.projects.findProject(projectId);
    const fallback = (): AutomationStudioLegacyRetirementState => ({ schemaVersion: "0.1", projectId, projectSchemaVersion: "0.1", phase: "compatibility", importerEvidence: [], intentionallyDeferred: [], importerCoverageAcknowledged: false, updatedAt: Date.now() });
    if (!this.paths.root) return structuredClone(this.memoryLegacyRetirementStates.get(projectId) ?? fallback());
    return await new ProgramJsonStore<AutomationStudioLegacyRetirementState>(this.paths.projectFile(projectId, "migration", "retirement-state.json"), fallback).read();
  }

  async writeLegacyRetirementState(state: AutomationStudioLegacyRetirementState): Promise<void> {
    if (!this.paths.root) { this.memoryLegacyRetirementStates.set(state.projectId, structuredClone(state)); return; }
    await new ProgramJsonStore<AutomationStudioLegacyRetirementState>(this.paths.projectFile(state.projectId, "migration", "retirement-state.json"), () => state).write(state);
  }

  async readLegacyRetirementAudit(projectId: string): Promise<AutomationStudioLegacyRetirementAuditEvent[]> {
    if (!this.paths.root) return structuredClone(this.memoryLegacyAudit.get(projectId) ?? []);
    return (await new ProgramJsonStore<{ events: AutomationStudioLegacyRetirementAuditEvent[] }>(this.paths.projectFile(projectId, "migration", "retirement-audit.json"), () => ({ events: [] })).read()).events ?? [];
  }

  async appendLegacyRetirementAudit(projectId: string, type: AutomationStudioLegacyRetirementAuditEvent["type"], details: JsonObject): Promise<void> {
    const event: AutomationStudioLegacyRetirementAuditEvent = { eventId: `legacy-audit.${randomUUID()}`, projectId, type, timestamp: Date.now(), details };
    if (!this.paths.root) { this.memoryLegacyAudit.set(projectId, [...(this.memoryLegacyAudit.get(projectId) ?? []), structuredClone(event)]); return; }
    await new ProgramJsonStore<{ events: AutomationStudioLegacyRetirementAuditEvent[] }>(this.paths.projectFile(projectId, "migration", "retirement-audit.json"), () => ({ events: [] })).update((value) => ({ events: [...(value.events ?? []), event] }));
  }

  async readLegacyBackup(projectId: string, backupId: string): Promise<AutomationStudioLegacyBackup | null> {
    if (!this.paths.root) return structuredClone(this.memoryLegacyBackups.get(`${projectId}:${backupId}`) ?? null);
    const value = await new ProgramJsonStore<JsonObject>(this.paths.projectFile(projectId, "migration", "backups", `${safeSegment(backupId)}.json`), () => ({})).read();
    return Object.keys(value).length ? value as unknown as AutomationStudioLegacyBackup : null;
  }

  async ensureLegacyBackup(projectId: string): Promise<AutomationStudioLegacyBackup> {
    const artifacts = await this.readLegacyProjectArtifacts(projectId);
    const digest = legacyArtifactsDigest(artifacts);
    const baseBackupId = `legacy-source.${safeSegment(projectId)}`;
    const baseBackup = await this.readLegacyBackup(projectId, baseBackupId);
    if (baseBackup?.digest === digest) return baseBackup;
    const backupId = baseBackup ? `${baseBackupId}.${digest.slice(0, 12)}` : baseBackupId;
    const existing = await this.readLegacyBackup(projectId, backupId);
    if (existing?.digest === digest) return existing;
    const backup: AutomationStudioLegacyBackup = { schemaVersion: "0.1", backupId, projectId, digest, artifacts: structuredClone(artifacts), createdAt: Date.now() };
    if (!this.paths.root) this.memoryLegacyBackups.set(`${projectId}:${backupId}`, structuredClone(backup));
    else await new ProgramJsonStore<AutomationStudioLegacyBackup>(this.paths.projectFile(projectId, "migration", "backups", `${safeSegment(backupId)}.json`), () => backup).write(backup);
    await this.appendLegacyRetirementAudit(projectId, "backup_created", { backupId, digest: backup.digest });
    return backup;
  }

  async readLegacyProjectArtifacts(projectId: string): Promise<AutomationStudioProjectArtifacts> {
    const pending = this.legacyProjectArtifactReads.get(projectId);
    if (pending) return pending;
    const read = this.readLegacyProjectArtifactsUncached(projectId);
    this.legacyProjectArtifactReads.set(projectId, read);
    try {
      return await read;
    } finally {
      if (this.legacyProjectArtifactReads.get(projectId) === read) this.legacyProjectArtifactReads.delete(projectId);
    }
  }

  private async readLegacyProjectArtifactsUncached(projectId: string): Promise<AutomationStudioProjectArtifacts> {
    await this.projects.findProject(projectId);
    const [tasks, routines, allConfigs, allFlows] = await Promise.all([
      this.readProjectArtifactList<AutomationStudioTaskArtifact>(projectId, "tasks"),
      this.readProjectArtifactList<AutomationStudioRoutineArtifact>(projectId, "routines"),
      this.readProjectArtifactList<AutomationStudioConfigArtifact>(projectId, "configs"),
      this.readProjectArtifactList<AutomationStudioFlowDocument>(projectId, "flows")
    ]);
    const configs = allConfigs.filter((config) => config.metadata?.generated !== true);
    const flows = allFlows.filter((flow) => typeof flow.ownerKind === "string");
    return { tasks, routines, configs, flows };
  }

  private async readProjectArtifactList<TArtifact>(projectId: string, folder: "tasks" | "routines" | "configs" | "flows"): Promise<TArtifact[]> {
    await this.projects.ensureProjectStructure(projectId);
    if (!this.paths.root) return [];
    const dir = path.join(this.paths.projectDirectory(projectId), folder);
    if (this.objectStore) {
      const documents = await ProgramJsonStore.listDirectoryDocuments<JsonObject>(dir, projectArtifactDocumentFileName(folder));
      return (documents ?? []) as unknown as TArtifact[];
    }
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const artifacts: TArtifact[] = [];
    const fileName = projectArtifactDocumentFileName(folder);
    for (const entry of entries) {
      const data = await new ProgramJsonStore<JsonObject>(path.join(dir, entry, fileName), () => ({})).read();
      if (Object.keys(data).length) artifacts.push(data as unknown as TArtifact);
    }
    return artifacts;
  }
}

export function legacyDiagnostic(state: AutomationStudioLegacyRetirementState): AutomationStudioLegacyRetirementDiagnostic {
  return state.phase === "write_locked"
    ? { code: "legacy.write_locked", deprecated: true, replacement: "canonical-flow-api", projectSchemaVersion: state.projectSchemaVersion, phase: state.phase, message: "Legacy Task/Routine writes are disabled for this Flow-first project. Use canonical Flow APIs." }
    : { code: "legacy.compatibility_write", deprecated: true, replacement: "canonical-flow-api", projectSchemaVersion: state.projectSchemaVersion, phase: state.phase, message: "Legacy Task/Routine writes are deprecated and available only during the compatibility window." };
}

export function legacyArtifactsDigest(artifacts: AutomationStudioProjectArtifacts): string {
  return createHash("sha256").update(stableJson(artifacts)).digest("hex");
}
