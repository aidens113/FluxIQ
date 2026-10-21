import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { readRecordSets } from "../../result-verification/index.ts";
import type { AutomationStudioPrepareCandidateStart } from "../candidate-trial/index.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../project-build/index.ts";
import { automationStudioRunGraphOptions } from "../runtime-session/index.ts";
import { runtimeSessionToFlowRunDetail } from "../summaries/index.ts";
import type { AutomationStudioServiceTrialCollaborators } from "./collaborators.ts";

// What every trial of a build is run with, from the service's own
// collaborators (t340; trace plan P5): the parent Flow and its base digest,
// the catalogue's publications, a runtime session of its own, a run's executor
// options for its run id (with the run's dataset batches and conversation
// parking where the service has them), dataset processing and reads, and the
// run detail's action attempts. A build makes its environment here
// (`../../service.ts`), and so does the trial-ports seam a host uses outside a
// build (`./service-ports.ts`), so the two cannot drift.

/** What a build's trial environment is made for: the build's Flow, instructions and start, its registry, and what the build adds. */
export type AutomationStudioServiceTrialEnvironmentInput = {
  projectId: string;
  flowId: string;
  sourceInstructionIds: readonly string[];
  startLocation?: string | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** The keys of a result that are a view of the target (the build's harness options'). */
  observedStateKeys?: readonly string[] | undefined;
  /** The deployment's candidate start hook; absent, no hook runs before a trial. */
  prepareStart?: AutomationStudioPrepareCandidateStart | undefined;
};

/** The trial environment a build of `input`'s Flow runs every trial with, over `collaborators` (header). */
export function automationStudioServiceTrialEnvironment(collaborators: AutomationStudioServiceTrialCollaborators, input: AutomationStudioServiceTrialEnvironmentInput): AutomationStudioProjectBuildTrialEnvironment {
  const { projectId, flowId } = input;
  return {
    projectId, flowId, sourceInstructionIds: input.sourceInstructionIds, startLocation: input.startLocation, registry: input.registry, resolution: input.resolution,
    parentFlow: () => collaborators.getFlow(projectId, flowId),
    currentBaseDigest: () => collaborators.dependencyDigest(projectId, flowId),
    snapshots: () => collaborators.catalogue().listPublishedFlowSnapshots(),
    deprecatedPublicationIds: async () => (await collaborators.catalogue().listFlowPublicationRecords()).filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`),
    openSession: ({ runId, metadata }) => collaborators.startRuntimeSession({ projectId, flowId, runId, metadata }),
    writeSession: (session) => collaborators.writeRuntimeSession(projectId, session),
    graphOptions: ({ runId, signal }) => {
      const datasets = collaborators.runDatasets();
      const conversations = collaborators.conversations();
      return automationStudioRunGraphOptions({
        signal, ...collaborators.executor(), authorizedDomainIds: [],
        ...(datasets.available ? { onRecordBatch: datasets.recordBatchHandler(projectId, runId) } : {}),
        ...(conversations.available ? { parking: conversations.parkingPort({ projectId, subject: { kind: "run", id: runId } }) } : {})
      });
    },
    processDatasets: (runId) => collaborators.runDatasets().processEndedRunDatasets({ projectId, runId }),
    recordSets: (runId) => {
      const datasets = collaborators.runDatasets();
      return readRecordSets(datasets.available ? { listRunDatasets: (request) => datasets.listRunDatasets(request), getRunDatasetPage: (request) => datasets.getRunDatasetPage(request) } : {}, projectId, runId);
    },
    actionAttempts: (session) => runtimeSessionToFlowRunDetail(session, projectId).actionAttempts,
    observedStateKeys: input.observedStateKeys,
    prepareStart: input.prepareStart
  };
}
