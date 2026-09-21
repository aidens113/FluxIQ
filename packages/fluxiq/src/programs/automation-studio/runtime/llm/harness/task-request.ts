import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapRoutingContext } from "../../flow-bootstrap/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow
} from "../../../model/index.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmRunBudgetAllowance, AutomationStudioLlmRunBudgetLedger } from "../run-budget.ts";
import type { AutomationStudioLoopStage, AutomationStudioLoopStageInstructionRegistry } from "../stages/index.ts";
import type { AutomationStudioLlmActionPermissions, AutomationStudioLlmContextPacket } from "./context-packet.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import type { AutomationStudioInstructionResolutionInput } from "./instruction.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmProviderMetadata, AutomationStudioLlmUsageSummary } from "./provider.ts";
import type { AutomationStudioLlmDiagnosisFields, AutomationStudioLlmStructuredResponse } from "./structured-response.ts";
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
  /** The bound domain's declared keys, exactly as the harness input declared
   * them, carried beside the context so a provider can re-check every evidence
   * slot before sending (`automationStudioLlmRequestEvidenceRefusal`). Never
   * part of what is sent, and not counted in `estimatedInputTokens`. Absent
   * when nobody declared any; a provider then refuses a request that carries
   * evidence, rather than reading the absence as an empty list. */
  deniedEvidenceKeys?: readonly string[];
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

/**
 * One packet a recovery's exploration returned, as a runtime patch is shown it.
 *
 * A domain numbers its handles per packet, so `target.3` in the failure packet
 * and `target.3` in a page the exploration revealed are different controls.
 * `evidenceId` is Core's label for the packet within one request, and a handle
 * taken from it is written `<evidenceId>:<handle>`, which is how the target
 * check knows which packet to ask the domain about. The label's one definition
 * is `explored-evidence-label.ts`; it never contains a colon.
 */
export type AutomationStudioLlmExploredEvidencePacket = {
  evidenceId: string;
  /** The option that returned the packet. */
  toolId: string;
  /** The packet exactly as the domain issued it. Core bounds it and never edits it. */
  packet: JsonObject;
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
   * enforces the domain's, and bounds shape and size regardless.
   *
   * Optional only for a request that carries no evidence and no reusable
   * context, which is most of them. Omitting it on a request that carries
   * `failureEvidence`, `explorationEvidence`, `reusableContext`, or an
   * `evidenceLoop` with anything gathered in it, is refused when the packet is
   * built: absent means nobody said, not "deny nothing". A domain with nothing
   * to deny declares `[]`. */
  deniedEvidenceKeys?: readonly string[];
  runId?: string;
  runDetail?: AutomationStudioFlowRunDetail;
  failureEvidence?: JsonObject;
  /** The packets a bounded exploration returned before a runtime patch was
   * asked for, oldest first, and the most bytes they may take. Runtime patch
   * only: any other task carrying them is refused when the packet is built.
   * The packet carries the newest that fit and counts the rest as withheld, so
   * what the model was shown -- `context.explorationEvidence` -- is the only
   * list a handle may be checked against. Requires `deniedEvidenceKeys`. */
  explorationEvidence?: {
    packets: readonly AutomationStudioLlmExploredEvidencePacket[];
    maxBytes: number;
  };
  /** The standardized recovery context for this failure, already built and
   * budgeted by the caller. It reaches the packet only for a runtime task. */
  recoveryContext?: AutomationStudioRuntimeRecoveryContext;
  /** The diagnosis the model itself produced one call earlier, read off the
   * diagnosis response. Runtime patch only: any other task carrying it is
   * refused when the packet is built.
   *
   * The patch stage's instruction is "carry out the plan you just stated", and
   * the request did not contain the plan -- so the model was asked to
   * implement something it was never shown. It is copied field by field and
   * bounded, never spread: the channel is a fixed set of keys, and an
   * unrecognized one is dropped rather than carried. */
  diagnosis?: AutomationStudioLlmDiagnosisFields;
  /** What a finished run produced, already bounded and screened by
   * `summarizeAutomationStudioRunResult`. Result verification only: any other
   * task carrying one leaves it out of the packet. */
  resultSummary?: AutomationStudioRunResultSummary;
  stateDiffs?: JsonValue[];
  routeHistory?: JsonValue[];
  relevantRuns?: JsonObject[];
  relevantAdaptations?: JsonObject[];
  reusableContext?: AutomationStudioReusableLlmContextPacket;
  subflows?: AutomationStudioFlowSubflow[];
  availableActions?: JsonObject[];
  flowBootstrap?: {
    registry?: AutomationStudioNodeRegistry;
    resolution: AutomationStudioNodeRegistryResolution;
    maxInputTokens?: number;
    /** What the model routes with; built by `buildAutomationStudioFlowBootstrapRoutingContext`. */
    routing?: AutomationStudioFlowBootstrapRoutingContext;
  };
  evidenceLoop?: AutomationStudioLlmContextPacket["evidenceLoop"];
  policy?: AutomationStudioAdaptationPolicy;
  /**
   * What the run's permission gate lets its actions do, when a gate governs
   * them: described to the model in place of the policy's side-effect flags,
   * which the gate has replaced as the authority (`context-packet.ts`).
   */
  actionPermissions?: AutomationStudioLlmActionPermissions;
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
  /** What kind of call this is, for the run's receipt: an exploration
   * decision says `exploration`, everything else is an ordinary run call. It
   * is a label only -- every call draws on the same backstop, token budget
   * and cost ceiling. */
  runBudgetAllowance?: AutomationStudioLlmRunBudgetAllowance;
  now?: () => number;
  metadata?: JsonObject;
};
