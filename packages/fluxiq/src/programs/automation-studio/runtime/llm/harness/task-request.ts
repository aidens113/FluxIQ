import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapRoutingContext, AutomationStudioFlowBootstrapSizeLimits } from "../../flow-bootstrap/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowIntervention,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowSubflow
} from "../../../model/index.ts";
import type { AutomationStudioConversationTurn } from "../../conversations/index.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmProviderInvocationState } from "../provider-contract.ts";
import type { AutomationStudioLlmProviderRetryAccount, AutomationStudioLlmProviderRetryLedger } from "../provider-retry/index.ts";
import type { AutomationStudioLlmProviderRefusal } from "../../provider-refusal/index.ts";
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
  /**
   * The provider a request was actually sent to.
   *
   * Absent when none was: no provider configured, a dry run, a refusal made
   * before the call, or a run budget that would not authorize it. It used to
   * describe the provider a refused reservation *would* have used, and the
   * reader downstream took its presence for the request having happened -- which
   * is how two live runs came to be recorded as an attempted provider request
   * with an unknown answer when no request was ever made
   * (`run-muhs8hx3-6fd929e6`, `run-muhtuizo-c458e49c`).
   * `providerInvocation` is the fact to route on; this field says which provider
   * the answer came from.
   */
  provider?: AutomationStudioLlmProviderMetadata;
  /**
   * Whether a request reached the provider, as the one caller that can know
   * says so.
   *
   * Stated on every path, because a reader cannot infer it: the absence of a
   * provider, a usage figure or a response is equally consistent with a call
   * that was never made and a call that failed. `not_attempted` is every return
   * before the provider is invoked, a refused run-budget reservation among them.
   * `attempted` is a call that was made. `unknown` is a call whose fate cannot
   * honestly be decided -- a deadline or a cancellation, where the request may
   * have been in flight -- and it comes from the failure's own provenance rather
   * than from a guess here.
   */
  providerInvocation: AutomationStudioLlmProviderInvocationState;
  /**
   * What the provider said when it refused the request, screened by the adapter
   * that read it and bounded by `refusal-record.ts`.
   *
   * Present for a non-2xx from an adapter that reads its refusals -- every one
   * of them in Core's DeepSeek adapter. A status says a request was wrong and
   * not how; this is the provider's own account of how, and the only thing in a
   * failed build that can name the field the provider objected to.
   */
  providerRefusal?: AutomationStudioLlmProviderRefusal;
  /**
   * Every provider request this call made beyond the one that answered, and why
   * it stopped asking (`../provider-retry/account.ts`).
   *
   * Absent when the first attempt settled the call, which is every call in a
   * working run. Present means a fault the adapter called temporary was met: a
   * rate limit, a 5xx, a request timeout, a dropped connection. It is stated as
   * a field and not left to be inferred from a diagnostic, because a host
   * accounting for a run's wall clock has to be able to say how much of it went
   * on waiting -- the alternative is an unexplained gap, which is how a 167- and
   * a 194-second run came to be read as something they were not.
   */
  providerRetry?: AutomationStudioLlmProviderRetryAccount;
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
   * `summarizeAutomationStudioRunResult`. Read by the verification that judges
   * a result and by the runtime diagnosis and patch that repair one judged
   * wrong; any other task carrying one leaves it out of the packet. */
  resultSummary?: AutomationStudioRunResultSummary;
  /** The thread the person and the automation have been talking in, in reading
   * order. The packet keeps the turns nearest the failure, bounded, and counts
   * the rest. Carried by the calls that are looking at a finished run: the
   * result verification, and the runtime diagnosis and patch. */
  conversation?: readonly AutomationStudioConversationTurn[];
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
    /** Where the Flow this build writes starts, when the build was told (`../../flow-bootstrap/start-location.ts`). */
    startLocation?: string;
    /** The Flow's size bounds, from its setting (`../../flow-bootstrap/plan/size-limits.ts`); the default when absent. */
    size?: AutomationStudioFlowBootstrapSizeLimits;
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
  /**
   * How this call retries a temporary provider fault. Absent means Core's own
   * policy, which is on for every call and needs no configuration
   * (`../provider-retry/limits.ts`).
   *
   * Nothing here can widen a bound: fewer attempts, never more, and the ledger
   * and the waiter exist so a caller can account for a run separately or drive
   * the clock in a test. A caller that wants no retrying at all says
   * `maxAttempts: 1` and gets exactly the behaviour this runtime had before.
   */
  providerRetry?: {
    maxAttempts?: number;
    ledger?: AutomationStudioLlmProviderRetryLedger;
    wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  };
  now?: () => number;
  metadata?: JsonObject;
};
