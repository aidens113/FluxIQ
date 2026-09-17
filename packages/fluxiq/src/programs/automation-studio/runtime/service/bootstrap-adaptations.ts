import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { ProgramJsonStore } from "../../../_shared/storage.ts";
import { assertAutomationStudioBootstrapHasNoRecordingProvenance, upgradeAutomationStudioBootstrapAdaptation, type AutomationStudioBootstrapAdaptation } from "../flow-bootstrap/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "./paths/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";

// Flow bootstrap adaptations. Every one written is also held in memory, which
// is the whole store when the service has no storage root, and a read-through
// cache when it has one. Every record read from storage is upgraded to today's
// shape before anything sees it (see storedBootstrapAdaptation).
export class AutomationStudioBootstrapAdaptationStore {
  private readonly memoryBootstrapAdaptations = new Map<string, AutomationStudioBootstrapAdaptation>();

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore
  ) {}

  async getFlowBootstrapAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioBootstrapAdaptation | null> {
    await this.projects.findProject(projectId);
    const key = bootstrapAdaptationMemoryKey(projectId, flowId, adaptationId);
    const memory = this.memoryBootstrapAdaptations.get(key);
    if (memory) return structuredClone(memory);
    if (!this.paths.root) return null;
    const stored = await new ProgramJsonStore<JsonObject>(this.flowPaths.flowBootstrapAdaptationFile(projectId, flowId, adaptationId), () => ({})).read();
    if (stored.kind !== "flow_bootstrap" || stored.adaptationId !== adaptationId || stored.projectId !== projectId || stored.flowId !== flowId) return null;
    const adaptation = storedBootstrapAdaptation(stored);
    this.memoryBootstrapAdaptations.set(key, structuredClone(adaptation));
    return adaptation;
  }

  async listProjectFlowBootstrapAdaptations(projectId: string, flowId?: string): Promise<AutomationStudioBootstrapAdaptation[]> {
    if (flowId) return await this.listFlowBootstrapAdaptations(projectId, flowId);
    await this.projects.findProject(projectId);
    const byId = new Map<string, AutomationStudioBootstrapAdaptation>();
    for (const adaptation of this.memoryBootstrapAdaptations.values()) {
      if (adaptation.projectId === projectId) byId.set(adaptation.adaptationId, structuredClone(adaptation));
    }
    if (!this.paths.root) return [...byId.values()];
    const flowEntries = await directoryEntries(this.paths.projectFile(projectId, "flows"));
    for (const flowEntry of flowEntries) {
      if (!flowEntry.isDirectory()) continue;
      const root = path.join(this.paths.projectFile(projectId, "flows"), flowEntry.name, "adaptations");
      const projected = await ProgramJsonStore.listDirectoryDocuments<JsonObject>(root, "bootstrap.json");
      const storedAdaptations = projected ?? await Promise.all((await directoryEntries(root))
        .filter((entry) => entry.isDirectory())
        .map((entry) => new ProgramJsonStore<JsonObject>(path.join(root, entry.name, "bootstrap.json"), () => ({})).read()));
      for (const stored of storedAdaptations) {
        if (stored.kind !== "flow_bootstrap" || stored.projectId !== projectId || typeof stored.flowId !== "string" || typeof stored.adaptationId !== "string") continue;
        byId.set(stored.adaptationId, storedBootstrapAdaptation(stored));
      }
    }
    return [...byId.values()].sort((left, right) => left.createdAt - right.createdAt || left.adaptationId.localeCompare(right.adaptationId));
  }

  async listFlowBootstrapAdaptations(projectId: string, flowId: string): Promise<AutomationStudioBootstrapAdaptation[]> {
    const byId = new Map<string, AutomationStudioBootstrapAdaptation>();
    for (const adaptation of this.memoryBootstrapAdaptations.values()) {
      if (adaptation.projectId === projectId && adaptation.flowId === flowId) {
        byId.set(adaptation.adaptationId, structuredClone(adaptation));
      }
    }
    if (!this.paths.root) return [...byId.values()];
    const root = this.flowPaths.flowAdaptationsDirectory(projectId, flowId);
    const projected = await ProgramJsonStore.listDirectoryDocuments<JsonObject>(root, "bootstrap.json");
    if (projected) {
      for (const stored of projected) {
        if (stored.kind === "flow_bootstrap" && stored.projectId === projectId && stored.flowId === flowId && typeof stored.adaptationId === "string") {
          byId.set(stored.adaptationId, storedBootstrapAdaptation(stored));
        }
      }
    } else {
      const entries = await directoryEntries(root);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const stored = await new ProgramJsonStore<JsonObject>(path.join(root, entry.name, "bootstrap.json"), () => ({})).read();
        if (stored.kind === "flow_bootstrap" && stored.projectId === projectId && stored.flowId === flowId && typeof stored.adaptationId === "string") {
          byId.set(stored.adaptationId, storedBootstrapAdaptation(stored));
        }
      }
    }
    return [...byId.values()].sort((left, right) => left.createdAt - right.createdAt || left.adaptationId.localeCompare(right.adaptationId));
  }

  async saveFlowBootstrapAdaptation(adaptation: AutomationStudioBootstrapAdaptation): Promise<AutomationStudioBootstrapAdaptation> {
    assertAutomationStudioBootstrapHasNoRecordingProvenance(adaptation);
    const key = bootstrapAdaptationMemoryKey(adaptation.projectId, adaptation.flowId, adaptation.adaptationId);
    this.memoryBootstrapAdaptations.set(key, structuredClone(adaptation));
    if (this.paths.root) {
      await this.projects.ensureProjectStructure(adaptation.projectId);
      await new ProgramJsonStore<JsonObject>(
        this.flowPaths.flowBootstrapAdaptationFile(adaptation.projectId, adaptation.flowId, adaptation.adaptationId),
        () => ({})
      ).write(adaptation as unknown as JsonObject);
    }
    return adaptation;
  }
}

// A record read from storage may predate modes, origins and node provenance.
// Apply compares its topology with a fresh normalization, which now stamps
// `adaptationIds` on each node it creates, so an older record approved but not
// yet applied applies only once it is upgraded. The upgrade returns a copy.
function storedBootstrapAdaptation(stored: JsonObject): AutomationStudioBootstrapAdaptation {
  assertAutomationStudioBootstrapHasNoRecordingProvenance(stored);
  return upgradeAutomationStudioBootstrapAdaptation(stored as unknown as AutomationStudioBootstrapAdaptation);
}

// A directory that does not exist holds no records. Any other failure to list
// it is an error: read as empty, it would hide every record under it.
async function directoryEntries(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function bootstrapAdaptationMemoryKey(projectId: string, flowId: string, adaptationId: string): string {
  return `${projectId}:${flowId}:${adaptationId}`;
}
