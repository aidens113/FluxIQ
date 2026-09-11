import { readdir } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { ProgramJsonStore } from "../../../_shared/storage.ts";
import { assertAutomationStudioBootstrapHasNoRecordingProvenance, type AutomationStudioBootstrapAdaptation } from "../flow-bootstrap/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "./paths/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";

// Flow bootstrap adaptations. Every one written is also held in memory, which
// is the whole store when the service has no storage root, and a read-through
// cache when it has one.
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
    assertAutomationStudioBootstrapHasNoRecordingProvenance(stored);
    const adaptation = stored as unknown as AutomationStudioBootstrapAdaptation;
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
    const flowEntries = await readdir(this.paths.projectFile(projectId, "flows"), { withFileTypes: true }).catch(() => []);
    for (const flowEntry of flowEntries) {
      if (!flowEntry.isDirectory()) continue;
      const root = path.join(this.paths.projectFile(projectId, "flows"), flowEntry.name, "adaptations");
      const projected = await ProgramJsonStore.listDirectoryDocuments<JsonObject>(root, "bootstrap.json");
      const storedAdaptations = projected ?? await Promise.all((await readdir(root, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isDirectory())
        .map((entry) => new ProgramJsonStore<JsonObject>(path.join(root, entry.name, "bootstrap.json"), () => ({})).read()));
      for (const stored of storedAdaptations) {
        if (stored.kind !== "flow_bootstrap" || stored.projectId !== projectId || typeof stored.flowId !== "string" || typeof stored.adaptationId !== "string") continue;
        assertAutomationStudioBootstrapHasNoRecordingProvenance(stored);
        byId.set(stored.adaptationId, stored as unknown as AutomationStudioBootstrapAdaptation);
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
          assertAutomationStudioBootstrapHasNoRecordingProvenance(stored);
          byId.set(stored.adaptationId, stored as unknown as AutomationStudioBootstrapAdaptation);
        }
      }
    } else {
      const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const stored = await new ProgramJsonStore<JsonObject>(path.join(root, entry.name, "bootstrap.json"), () => ({})).read();
        if (stored.kind === "flow_bootstrap" && stored.projectId === projectId && stored.flowId === flowId && typeof stored.adaptationId === "string") {
          assertAutomationStudioBootstrapHasNoRecordingProvenance(stored);
          byId.set(stored.adaptationId, stored as unknown as AutomationStudioBootstrapAdaptation);
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

function bootstrapAdaptationMemoryKey(projectId: string, flowId: string, adaptationId: string): string {
  return `${projectId}:${flowId}:${adaptationId}`;
}
