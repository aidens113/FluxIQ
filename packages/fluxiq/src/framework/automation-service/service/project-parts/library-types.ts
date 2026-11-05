import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import type { AutomationStudioSubflowSummaryPage } from "../summaries/index.ts";
import type { AutomationStudioProjectPartRunPorts } from "./run/index.ts";

/** What the library reads of the service: a Flow, its Subflows, and the person's words the Flow was asked with. */
export type AutomationStudioProjectPartsPorts = {
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  getFlowSubflow(projectId: string, flowId: string, subflowId: string): Promise<AutomationStudioFlowSubflow | null>;
  listFlowSubflowSummaries(input: { projectId: string; flowId?: string; limit?: unknown; offset?: unknown }): Promise<AutomationStudioSubflowSummaryPage>;
  /** The Flow's instruction bodies. Compared with when a part is saved, never stored. */
  instructionBodies(projectId: string, flowId: string): Promise<readonly string[]>;
};

export type AutomationStudioProjectPartsDependencies = {
  /** Absent when the service keeps no project database: every call then answers `parts.unavailable`. */
  pool: AutomationStudioProjectDatabasePool | undefined;
  ports: AutomationStudioProjectPartsPorts;
  /** What a part run reaches of the service. Absent, a run answers `parts.unavailable`. */
  run?: AutomationStudioProjectPartRunPorts | undefined;
};

/** A refusal the library answers in place of throwing. The code is closed; the message is plain words. */
export type AutomationStudioProjectPartsRefusal = {
  ok: false;
  code: "parts.unavailable" | "parts.not_found";
  message: string;
};
