import { rm } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { ProgramJsonStore } from "../../../_shared/storage.ts";
import { parseAutomationStudioFlowBootstrapIncompleteDraft, type AutomationStudioFlowBootstrapIncompleteDraft } from "../flow-bootstrap/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "./paths/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";

// Incomplete drafts (`flow-bootstrap/incomplete-draft/`): at most one per Flow,
// the latest revision, in `incomplete-draft.json` beside the Flow's own file
// and deliberately outside `adaptations/`, so that nothing that lists, applies
// or approves adaptations ever meets one. Held in memory as well, which is the
// whole store when the service has no storage root, as the adaptation store is.
export class AutomationStudioFlowBootstrapIncompleteDraftStore {
  private readonly memory = new Map<string, AutomationStudioFlowBootstrapIncompleteDraft>();

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore
  ) {}

  /** The Flow's incomplete draft, or `undefined` when it has none -- or has only a file Core did not write. */
  async get(projectId: string, flowId: string): Promise<AutomationStudioFlowBootstrapIncompleteDraft | undefined> {
    const key = memoryKey(projectId, flowId);
    const held = this.memory.get(key);
    if (held) return structuredClone(held);
    if (!this.paths.root) return undefined;
    const stored = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    const record = parseAutomationStudioFlowBootstrapIncompleteDraft(stored, { projectId, flowId });
    if (!record) return undefined;
    this.memory.set(key, structuredClone(record));
    return record;
  }

  async save(record: AutomationStudioFlowBootstrapIncompleteDraft): Promise<AutomationStudioFlowBootstrapIncompleteDraft> {
    this.memory.set(memoryKey(record.projectId, record.flowId), structuredClone(record));
    if (this.paths.root) {
      await this.projects.ensureProjectStructure(record.projectId);
      await new ProgramJsonStore<JsonObject>(this.file(record.projectId, record.flowId), () => ({})).write(record as unknown as JsonObject);
    }
    return record;
  }

  async delete(projectId: string, flowId: string): Promise<void> {
    this.memory.delete(memoryKey(projectId, flowId));
    if (!this.paths.root) return;
    // A document the program-state database holds is deleted there; one on disk, from disk.
    const file = this.file(projectId, flowId);
    if (!await ProgramJsonStore.deletePath(file)) await rm(file, { force: true });
  }

  private file(projectId: string, flowId: string): string {
    return path.join(this.flowPaths.flowDirectory(projectId, flowId), "incomplete-draft.json");
  }
}

function memoryKey(projectId: string, flowId: string): string {
  return `${projectId}:${flowId}`;
}
