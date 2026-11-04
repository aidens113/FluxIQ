// What one attempt is handed by the generation path (`../../../service.ts`): what the common
// path has already made (binding, provider, permission ground, routing, harness options,
// instruction authority, the purse), and the service's own stores by what they do.

import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowCandidateDraftStore } from "../../candidate-drafts/index.ts";
import type { AutomationStudioBuildRouting } from "../../../route-state/index.ts";
import type { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectParts } from "../../project-parts/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import type { AutomationStudioBuildCancellation, AutomationStudioFlowBootstrapCreationPurse } from "../../flow-bootstrap-commands/index.ts";
import type { automationStudioFlowBootstrapInstructionAuthority } from "../../instruction-authority.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioCandidateOriginalSourceBinding } from "../../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import type { AutomationStudioFlowBootstrapSizeLimits, automationStudioFlowBootstrapActionPermissions } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { automationStudioFlowBootstrapDraftActs, AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmHarnessInput, AutomationStudioLlmNodeDescriptions, AutomationStudioLlmProvider, AutomationStudioLlmTaskResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioFlowBootstrapEvidenceLoopLimits } from "../../../../../runtime/loop-limits/index.ts";
import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";

export type AutomationStudioAnswerFirstAttemptInput = {
  /** The generate call's own input: what the answer is held under for a Stop (`./stop-answer.ts`). */
  request: object;
  /** The service, as the key of its per-service stores and ports (`../attempt-store/store-of.ts`, `./ports.ts`). */
  owner: object;
  stores: {
    paths: Pick<AutomationStudioProjectPaths, "root">;
    flows: Pick<AutomationStudioFlowPaths, "flowDirectory">;
    projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">;
    drafts: Pick<AutomationStudioFlowCandidateDraftStore, "save">;
    datasets: Pick<AutomationStudioRunDatasets, "available" | "recordBatchHandler" | "processEndedRunDatasets" | "listRunDatasetsForVerification" | "getRunDatasetPage">;
    openSession(input: { runId: string; metadata: NonNullable<AutomationStudioRuntimeSession["metadata"]> }): Promise<AutomationStudioRuntimeSession>;
    writeSession(session: AutomationStudioRuntimeSession): Promise<void>;
  };
  cancellation: Pick<AutomationStudioBuildCancellation, "signal" | "tool" | "checkpoint">;
  projectId: string;
  flowId: string;
  binding: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
  controlParameterKeys: ReadonlySet<string> | undefined;
  stepLogPageText: AutomationStudioLlmEvidenceLoopInput["stepLogPageText"];
  provider: { provider: AutomationStudioLlmProvider; tokenLimits?: AutomationStudioLlmHarnessInput["tokenLimits"]; timeoutMs?: number | undefined };
  limits: AutomationStudioFlowBootstrapEvidenceLoopLimits;
  creation: AutomationStudioFlowBootstrapCreationPurse;
  authority: ReturnType<typeof automationStudioFlowBootstrapInstructionAuthority>;
  /** The permission gate's input but its executor, which this attempt's call chain supplies (`./call-chain.ts`). */
  permissionGround: Omit<Parameters<typeof automationStudioFlowBootstrapActionPermissions>[0], "executeTool">;
  /** Where a person-only check or a stuck attempt's question goes. Absent, there is nobody to ask. */
  personAsk: { port: AutomationStudioParkingPort } | undefined;
  routing: AutomationStudioBuildRouting;
  runHarness(request: AutomationStudioLlmHarnessInput): Promise<AutomationStudioLlmTaskResult>;
  promptInstructions: Pick<AutomationStudioLlmHarnessInput, "instructions">;
  activeInstructions: Parameters<typeof automationStudioFlowBootstrapDraftActs>[0]["activeInstructions"];
  instructionIds: string[];
  instructionText: string;
  source: AutomationStudioCandidateOriginalSourceBinding | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  size: AutomationStudioFlowBootstrapSizeLimits;
  startLocation: string | undefined;
  /** The domain's tools for the first round, which go to the start location. */
  harnessOptions: AutomationStudioHarnessOptionLoopBinding;
  /** The same tools told no start location, for every later round: it carries on from the page as it stands. */
  continuingOptions(): AutomationStudioHarnessOptionLoopBinding;
  nodeDescriptions: AutomationStudioLlmNodeDescriptions;
  baseDependencyDigest: string;
  baseSettingsRevision: number;
  /** The project's library of saved parts: offered in the opening look and kept from the draft (`../../project-parts/known-parts.ts`). Absent, neither happens. */
  parts?: Pick<AutomationStudioProjectParts, "runAs" | "shortlist" | "saveDraft"> | undefined;
};
