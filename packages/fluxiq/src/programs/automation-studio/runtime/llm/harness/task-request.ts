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
import type { AutomationStudioLlmTaskDomainInstructions } from "../domain-instructions/index.ts";
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
  /** The bound domain's own system instructions, stamped on the request by the
   * provider the service resolved for that domain's work
   * (`../domain-instructions/provider.ts`) rather than by any call site.
   * Carried beside the context like `deniedEvidenceKeys`: never part of the
   * user payload. Unlike them it is sent -- an adapter places the text in its
   * system message (`../deepseek/system-prompt.ts`) -- so a provider's
   * `measureInput` counts it. Absent, the system message is Core's alone. */
  domainInstructions?: AutomationStudioLlmTaskDomainInstructions;
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
 * A domain numbers its handles per packet, so `t3` in the failure packet
 * and `t3` in a page the exploration revealed are different controls.
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

/**
 * The unit an in-run repair is held to (state-aware recovery plan, C6 step 8,
 * C12): the failing node, the handler that failed, or the part whose contract
 * the failure broke, by its kind and its id.
 */
export type AutomationStudioLlmInRunRepairUnit = { kind: "node" | "handler" | "part"; id: string };

/** One step as a unit's contract names it: authored identity, never a resolved value. */
export type AutomationStudioLlmInRunRepairStep = {
  nodeId: string;
  definitionId: string;
  definitionVersion?: string;
  label?: string;
  description?: string;
};

/** One port of a part's interface, by name and type. */
export type AutomationStudioLlmInRunRepairPort = { id: string; name?: string; valueType?: string; required?: true };

/**
 * What the unit promised, as the model is shown it. Authored data only, screened
 * by the builder (`recovery/in-run-repair/unit-contract.ts`). `absent` says the
 * unit could not be found in the graph the run holds.
 *
 * - A node: its definition and parameters, and where each of its ports leads.
 * - A handler: its event, scope, `when`, completion check, order, and its body.
 * - A part: its interface, its success check, its entries and checkpoints, and its steps.
 *
 * `withheld` is the packet's: a contract that carries a credential, or a key
 * the bound domain denies, is not sent (`./context-packet.ts`).
 */
export type AutomationStudioLlmInRunRepairContract =
  | { kind: "node" | "handler" | "part"; withheld: "screened" }
  | { kind: "node"; nodeId: string; absent: true }
  | (AutomationStudioLlmInRunRepairStep & {
    kind: "node";
    parameters: { values: JsonObject; withheld?: string[] } | { withheld: "no_denied_keys_declared" };
    routes: Array<{ port: string; to: string }>;
  })
  | { kind: "handler"; handlerNodeId: string; absent: true }
  | {
    kind: "handler";
    handlerNodeId: string;
    event: string;
    scope: JsonValue;
    when: JsonValue;
    completionCheck: JsonValue;
    order: number;
    maxRuns: number;
    body: AutomationStudioLlmInRunRepairStep[];
  }
  | { kind: "part"; subflowId: string; absent: true }
  | {
    kind: "part";
    subflowId: string;
    name: string;
    interface: { inputs: AutomationStudioLlmInRunRepairPort[]; outputs: AutomationStudioLlmInRunRepairPort[] };
    successCheck: JsonValue;
    entries: Array<{ id: string; nodeId: string; order: number; requires: string[] }>;
    checkpoints: Array<{ id: string; nodeId: string; requires: string[] }>;
    steps: AutomationStudioLlmInRunRepairStep[];
  };

/** The incident that became a true failure: ids and codes only. */
export type AutomationStudioLlmInRunRepairIncident = {
  incidentId: string;
  origin: { framePath: string[]; nodeId: string; failureCode: string };
  handlersRun: string[];
  routes: Array<{ checkpointId: string; handlerId: string }>;
  alternatives: Array<{ handlerId: string; subflowId?: string }>;
  trueFailure: boolean;
};

/** The attempt whose failure made the incident true. */
export type AutomationStudioLlmInRunRepairAttempt = {
  attemptId: string;
  nodeId: string;
  definitionId: string;
  status: string;
  route?: string;
  failure?: { category: string; code: string; retryable?: boolean };
  failureClass?: string;
  framePath?: string[];
};

/**
 * One recovery the run already tried: a retry, a handler, a state route, a
 * ladder rung, an earlier repair, or a counted failure. Ids, codes, counts and
 * outcomes beside the three fields every kind carries.
 */
export type AutomationStudioLlmInRunRepairRecovery = {
  attemptId: string;
  nodeId: string;
  kind: "retry" | "handler" | "state_route" | "ladder" | "repair" | "counted";
  [detail: string]: JsonValue;
};

/** One act the run already completed, which a fix must not repeat. */
export type AutomationStudioLlmInRunRepairAct = {
  attemptId: string;
  nodeId: string;
  definitionId: string;
  framePath?: string[];
  effectCheck?: string;
};

/**
 * What an in-run repair request is told about the repair: the unit and its
 * contract, the incident, and what the run already tried and did. Filled by
 * `recovery/in-run-repair/request.ts`; a runtime patch only. Its presence is
 * what makes a request an in-run repair, and what adds the in-run repair
 * instruction (`./instruction.ts`).
 *
 * The two histories grow with the run, so the packet keeps the newest entries
 * of each up to a fixed count and says how many it left out
 * (`./context-packet.ts`); every attempt stays whole in `recentActions`.
 */
export type AutomationStudioLlmInRunRepairContext = {
  unit: AutomationStudioLlmInRunRepairUnit;
  contract: AutomationStudioLlmInRunRepairContract;
  incident: AutomationStudioLlmInRunRepairIncident;
  failedAttempt: AutomationStudioLlmInRunRepairAttempt;
  recoveriesTried: AutomationStudioLlmInRunRepairRecovery[];
  actsCompleted: AutomationStudioLlmInRunRepairAct[];
  /** How many entries the packet left out, per list (the oldest past its count,
   * and any that failed the screen); absent when none. */
  omitted?: { recoveriesTried?: number; actsCompleted?: number };
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
   * enforces the domain's.
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
  /** The packets an exploration returned before a runtime patch was asked
   * for, oldest first. Runtime patch and re-planning diagnosis only: any other
   * task carrying them is refused when the packet is built. The packet carries
   * every one of them, and what the model was shown --
   * `context.explorationEvidence` -- is the only list a handle may be checked
   * against. Requires `deniedEvidenceKeys`. */
  explorationEvidence?: {
    packets: readonly AutomationStudioLlmExploredEvidencePacket[];
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
  /** The in-run repair this patch is for: present only when the run is held at
   * the failing step. Runtime patch only: any other task carrying it leaves it,
   * and the instruction that explains it, out of the packet. */
  inRunRepair?: AutomationStudioLlmInRunRepairContext;
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
    /** What the model routes with; built by `buildAutomationStudioFlowBootstrapRoutingContext`. */
    routing?: AutomationStudioFlowBootstrapRoutingContext;
    /** Where the Flow this build writes starts, when the build was told (`../../flow-bootstrap/start-location.ts`). */
    startLocation?: string;
    /** The Flow's size bounds, from its setting (`../../flow-bootstrap/plan/size-limits.ts`); the default when absent. */
    size?: AutomationStudioFlowBootstrapSizeLimits;
    /**
     * The nodes this build has been shown whole so far, in the order they were
     * first described (`../node-tools/node-descriptions.ts`). An evidence
     * decision is shown every node by name and only these in full.
     */
    describedNodeIds?: readonly string[];
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
