import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioConversations } from "../../conversations/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";
import type { AutomationStudioCatalogue } from "../catalogue.ts";
import type { AutomationStudioRunDatasets } from "../datasets/index.ts";
import type { automationStudioRunGraphOptions } from "../runtime-session/index.ts";

/**
 * The Automation Studio service's collaborators a trial of a build runs with
 * (trace plan P5): the Flow and its base, the catalogue's publications, the
 * runtime sessions, the executor's parts, run datasets, conversation parking
 * and the bound domain. Each is read when a trial asks for it, never copied,
 * since a host binds the executor's parts and the domain after the service is
 * built. The service hands these over as it is built
 * (`./collaborator-registry.ts`); its build's trial environment
 * (`./environment.ts`) and the public trial-ports seam (`./service-ports.ts`)
 * both read them.
 */
export type AutomationStudioServiceTrialCollaborators = Readonly<{
  getFlow(projectId: string, flowId: string): Promise<AutomationStudioFlowArtifact>;
  /** The Flow's LLM execution dependency digest now. */
  dependencyDigest(projectId: string, flowId: string): Promise<string>;
  catalogue(): Pick<AutomationStudioCatalogue, "listPublishedFlowSnapshots" | "listFlowPublicationRecords">;
  startRuntimeSession(input: { projectId: string; flowId: string; runId: string; metadata: JsonObject }): Promise<AutomationStudioRuntimeSession>;
  writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void>;
  /** The executor's parts a run's options are made from (`../runtime-session/graph-options.ts`). */
  executor(): Pick<Parameters<typeof automationStudioRunGraphOptions>[0], "io" | "runtimeService" | "nativeNodeRuntime" | "hostRuntime">;
  runDatasets(): Pick<AutomationStudioRunDatasets, "available" | "recordBatchHandler" | "processEndedRunDatasets" | "listRunDatasets" | "getRunDatasetPage">;
  conversations(): Pick<AutomationStudioConversations, "available" | "parkingPort">;
  /** The bound domain's evidence runtime; undefined until a host binds one. */
  binding(): AutomationStudioLlmEvidenceRuntimeBinding | undefined;
}>;
