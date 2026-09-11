import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow
} from "../../../model/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmRunBudgetLedger } from "../run-budget.ts";
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
  runId?: string;
  runDetail?: AutomationStudioFlowRunDetail;
  failureEvidence?: JsonObject;
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
