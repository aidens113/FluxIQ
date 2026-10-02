import { rm } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { ProgramJsonStore } from "../../../_shared/storage.ts";
import { parseAutomationStudioFlowBootstrapCreationSpend, type AutomationStudioFlowBootstrapCreationSpend } from "../flow-bootstrap/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "./paths/index.ts";
import type { AutomationStudioProjectStore } from "./projects/index.ts";

// A Flow creation's spend (`flow-bootstrap/creation-spend/`): at most one per
// Flow, in `creation-spend.json` beside the Flow's own file. Held in memory as
// well, which is the whole store when the service has no storage root, as the
// incomplete-draft store is (`./incomplete-drafts.ts`).
export class AutomationStudioFlowBootstrapCreationSpendStore {
  private readonly memory = new Map<string, AutomationStudioFlowBootstrapCreationSpend>();

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore
  ) {}

  /** What the Flow's creation has spent so far, or `undefined` when nothing is recorded -- or only a file Core did not write. */
  async get(projectId: string, flowId: string): Promise<AutomationStudioFlowBootstrapCreationSpend | undefined> {
    const key = memoryKey(projectId, flowId);
    const held = this.memory.get(key);
    if (held) return structuredClone(held);
    if (!this.paths.root) return undefined;
    const stored = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    const record = parseAutomationStudioFlowBootstrapCreationSpend(stored, { projectId, flowId });
    if (!record) return undefined;
    this.memory.set(key, structuredClone(record));
    return record;
  }

  async save(record: AutomationStudioFlowBootstrapCreationSpend): Promise<AutomationStudioFlowBootstrapCreationSpend> {
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
    return path.join(this.flowPaths.flowDirectory(projectId, flowId), "creation-spend.json");
  }
}

function memoryKey(projectId: string, flowId: string): string {
  return `${projectId}:${flowId}`;
}
