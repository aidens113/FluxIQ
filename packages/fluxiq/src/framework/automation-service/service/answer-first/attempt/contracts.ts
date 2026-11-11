// What one attempt is handed by the generation path (`../../../service.ts`): what the common
// path has already made (binding, provider, permission ground, routing, harness options,
// instruction authority, the purse), and the service's own stores by what they do.

import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioAnswerFirstFlowWriter } from "../apply-proven/index.ts";
import type { AutomationStudioFlowCandidateDraftStore } from "../../candidate-drafts/index.ts";
import type { AutomationStudioBuildRouting } from "../../../route-state/index.ts";
import type { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioAnswerFirstPartActs, AutomationStudioProjectParts } from "../../project-parts/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import type { AutomationStudioAnswerFirstCallerOptions, AutomationStudioBuildCancellation, AutomationStudioFlowBootstrapCreationPurse } from "../../flow-bootstrap-commands/index.ts";
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
  /**
   * The person's starting value for how human the run acts, 0-100, as the generate request said it (validated by its reader).
   * A task with no level of its own stores it (`./run-attempt.ts`); a run resolves its level by precedence: a caller's own
   * `caller.humanness`, the task's level, the Flow's, then this (`../flow-run/flow-run.ts`). With none of them, no level (0).
   */
  humanness?: number | undefined;
  /** The service, as the key of its per-service stores and ports (`../attempt-store/store-of.ts`, `./ports.ts`), and by what applying a proven Flow calls on it (`../apply-proven/flow-writer.ts`). */
  owner: AutomationStudioAnswerFirstFlowWriter;
  stores: {
    paths: Pick<AutomationStudioProjectPaths, "root" | "projectFile">;
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
  /** Set where a part may run: told this attempt's act record, so what a part's steps land is in it (`../../project-parts/known-parts.ts`). */
  partActs?: AutomationStudioAnswerFirstPartActs | undefined;
  /** A caller's own settings for this attempt, read (`../caller/options.ts`): its task key, its check and judge, its person port and its scope. The model and budget were applied before it opened. Absent on a chat attempt, which is then exactly as it was. */
  caller?: AutomationStudioAnswerFirstCallerOptions | undefined;
};
