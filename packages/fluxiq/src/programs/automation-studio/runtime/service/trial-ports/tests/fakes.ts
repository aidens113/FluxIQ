// Stand-in service collaborators for the trial-ports tests: each records what
// it was asked and answers a fixed value, so a test can read which
// collaborator a trial port reached and with what. No store, run or model.
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import type { AutomationStudioServiceTrialCollaborators } from "../index.ts";

export const PROJECT = "project.trial-ports";
export const FLOW = "flow.trial-ports";

/** A parent Flow carrying only what a trial environment reads of it: its scope. */
export const PARENT = { flowId: FLOW, scope: { domainId: "isolated" } } as unknown as AutomationStudioFlowArtifact;

/** A bound domain whose trial reads answer fixed values, and whose view keys repeat one. */
export const BINDING = {
  domainId: "isolated", deniedEvidenceKeys: ["secret.key"], observedStateKeys: ["read.view", "read.view", "read.other"], tools: [],
  executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: {}, effectApplied: false, targetsUnchanged: true }),
  clearedControlHandles: async () => ({ wayOut1: "handle.1" })
} as unknown as AutomationStudioLlmEvidenceRuntimeBinding;

/** The collaborators, and every call each was asked, by name. */
export function fakeCollaborators(options: { binding?: AutomationStudioLlmEvidenceRuntimeBinding | undefined } = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const seen = (name: string, ...args: unknown[]) => calls.push({ name, args });
  const session = { runId: "run.1" } as unknown as AutomationStudioRuntimeSession;
  const batch = async () => ({ datasetId: "dataset.1" });
  const parking = { park: async () => undefined };
  const collaborators = {
    getFlow: async (projectId: string, flowId: string) => {
      seen("getFlow", projectId, flowId);
      return PARENT;
    },
    dependencyDigest: async (projectId: string, flowId: string) => {
      seen("dependencyDigest", projectId, flowId);
      return "digest.base";
    },
    catalogue: () => ({
      listPublishedFlowSnapshots: async () => [],
      listFlowPublicationRecords: async () => [{ status: "deprecated", flowId: "flow.old", version: 2 }, { status: "published", flowId: "flow.new", version: 1 }]
    }),
    startRuntimeSession: async (input: { projectId: string; flowId: string; runId: string; metadata: JsonObject }) => {
      seen("startRuntimeSession", input);
      return session;
    },
    writeRuntimeSession: async (projectId: string, written: AutomationStudioRuntimeSession) => {
      seen("writeRuntimeSession", projectId, written);
    },
    executor: () => ({ io: undefined, runtimeService: undefined, nativeNodeRuntime: undefined, hostRuntime: undefined }),
    runDatasets: () => ({
      available: true,
      recordBatchHandler: (projectId: string, runId: string) => {
        seen("recordBatchHandler", projectId, runId);
        return batch;
      },
      processEndedRunDatasets: async (input: { projectId: string; runId: string }) => {
        seen("processEndedRunDatasets", input);
      },
      listRunDatasets: async () => [],
      getRunDatasetPage: async () => null
    }),
    conversations: () => ({
      available: true,
      parkingPort: (input: { projectId: string; subject: { kind: string; id: string } }) => {
        seen("parkingPort", input);
        return parking;
      }
    }),
    binding: () => options.binding
  } as unknown as AutomationStudioServiceTrialCollaborators;
  return { collaborators, calls, session, batch, parking };
}
