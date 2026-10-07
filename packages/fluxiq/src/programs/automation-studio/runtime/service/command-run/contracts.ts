import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/project/index.ts";

/** Nominal scope only; the issuing controller's private registration grants authority. */
export class AutomationStudioCommandRunScope {
  private constructor() { Object.freeze(this); }
  static create(): AutomationStudioCommandRunScope { return new AutomationStudioCommandRunScope(); }
}
export type AutomationStudioCommandRunOwner = { projectId: string; runId: string; rootFlowId: string };
export type AutomationStudioCommandRunPorts = { pool?: AutomationStudioProjectDatabasePool; getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> };
