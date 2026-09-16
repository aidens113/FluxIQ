import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow
} from "../../../model/index.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmRunBudgetLedger } from "../run-budget.ts";
import type { AutomationStudioLoopStage, AutomationStudioLoopStageInstructionRegistry } from "../stages/index.ts";
import type { AutomationStudioLlmContextPacket } from "./context-packet.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import type { AutomationStudioInstructionResolutionInput } from "./instruction.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmProviderMetadata, AutomationStudioLlmUsageSummary } from "./provider.ts";
import type { AutomationStudioLlmStructuredResponse } from "./structured-response.ts";
import type { AutomationStudioLlmTaskKind } from "./task-kind.ts";
import type { AutomationStudioLlmTokenLimits } from "./token-limits.ts";

export type AutomationStudioLlmTaskRequest = {
  requestId: string;
  idempotencyKey: string;
  timeoutMs: number;
  estimatedInputTokens: number;
  taskKind: AutomationStudioLlmTaskKind;
  promptVersion: string;
  context: AutomationStudioLlmContextPacket;
  expectedOutput: "diagnosis" | "runtime_patch" | "change_proposal" | "instruction_suggestion" | "flow_bootstrap" | "evidence_tool_decision";
  tokenLimits: AutomationStudioLlmTokenLimits;
  maxEstimatedCostUsd: number;
  dryRun?: boolean;
  metadata?: JsonObject;
};

export type AutomationStudioLlmTaskResult = {
  ok: boolean;
  request: AutomationStudioLlmTaskRequest;
  response?: AutomationStudioLlmStructuredResponse;
  provider?: AutomationStudioLlmProviderMetadata;
  usage?: AutomationStudioLlmUsageSummary;
  diagnostics: AutomationStudioLlmDiagnostic[];
  intervention: AutomationStudioFlowIntervention;
};

export type AutomationStudioLlmHarnessInput = AutomationStudioInstructionResolutionInput & {
  taskKind: AutomationStudioLlmTaskKind;
  /** Which stage of the loop's fixed order this call belongs to. Naming one
   * puts the request under the protocol: Core's ordering statement and that
   * stage's instructions are added, the prompt is versioned by stage, and the
   * move from `previousStage` is checked before any provider is called. */
  stage?: AutomationStudioLoopStage;
  /** The stage the loop was in before this call, so the move can be refused
   * when it breaks the order. Absent means this is the first call of a run,
   * which must therefore be the first stage. */
  previousStage?: AutomationStudioLoopStage;
  /** The domains' contributions to the stage instructions. Absent means Core's
   * defaults, which is also what an empty registry produces. */
  stageInstructions?: AutomationStudioLoopStageInstructionRegistry;
  /** Keys the active domain has declared may never appear in evidence or in
   * reusable context, because for its medium they carry raw payload or
   * something directly executable. Core holds no such list of its own: it
   * enforces the domain's, and bounds shape and size regardless. */
  deniedEvidenceKeys?: readonly string[];
  runId?: string;
  runDetail?: AutomationStudioFlowRunDetail;
  failureEvidence?: JsonObject;
  /** The standardized recovery context for this failure, already built and
   * budgeted by the caller. It reaches the packet only for a runtime task. */
  recoveryContext?: AutomationStudioRuntimeRecoveryContext;
  stateDiffs?: JsonValue[];
  routeHistory?: JsonValue[];
  relevantRuns?: JsonObject[];
  relevantAdaptations?: JsonObject[];
  reusableContext?: AutomationStudioReusableLlmContextPacket;
  subflows?: AutomationStudioFlowSubflow[];
  availableActions?: JsonObject[];
  flowBootstrap?: { registry?: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution; maxInputTokens?: number };
  evidenceLoop?: AutomationStudioLlmContextPacket["evidenceLoop"];
  policy?: AutomationStudioAdaptationPolicy;
  provider?: AutomationStudioLlmProvider;
  dryRun?: boolean;
  expectedOutput?: AutomationStudioLlmTaskRequest["expectedOutput"];
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  maxEstimatedCostUsd?: number;
  requestId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  runBudget?: AutomationStudioLlmRunBudgetLedger;
  now?: () => number;
  metadata?: JsonObject;
};
