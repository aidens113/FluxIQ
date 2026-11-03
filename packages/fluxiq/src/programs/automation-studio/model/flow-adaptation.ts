import type { AutomationStudioChangeProposalPatch as ChangeProposalPatch } from "../../../flows/executable/change/proposal/index.ts";
import type { AutomationStudioFlowAdaptation as FlowAdaptationRecord } from "../../../flows/executable/adaptation/index.ts";
import type { ExecutableChangeProposalMode, ExecutableChangeProposalStatus, ExecutableChangeProposalKind, ExecutableAdaptationRiskLevel, ExecutableAdaptationStatus, ExecutableChangeEntryPoint, ExecutableChangeOrigin, ExecutableChangeValidationKind, ExecutableAdaptationValidationResult } from "../../../flows/executable/change/index.ts";
import type { FlowInstruction, InstructionScope, InstructionTag, InstructionRequirement } from "../../../flows/authoring/index.ts";
import type { ExecutableRouteDecision } from "../../../flows/executable/routing/index.ts";
import type { AutomationStudioFlowRouter, AutomationStudioFlowSubflow } from "../../../flows/authoring/routing/index.ts";
import type { AutomationStudioAdaptationPolicy } from "../../../flows/authoring/adaptation-policy/index.ts";
export type { AutomationStudioAdaptationPolicyPreset, AutomationStudioAdaptationPolicy } from "../../../flows/authoring/adaptation-policy/index.ts";
import type { AutomationStudioFailureRecord, AutomationStudioRunDatasetSummary, AutomationStudioTargetActionabilityRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { ExecutableFlowRunStatus } from "../../../flows/executable/execution/index.ts";
import type { AutomationConditionExpression } from "./conditions.ts";
import type { EvidenceReference, StateFactReference } from "./evidence.ts";
import type { AutomationStudioFlowScope } from "./flows.ts";

export type { AutomationStudioFlowExpansionStatus, AutomationStudioRouteTarget, AutomationStudioFlowRouteGroup, AutomationStudioFlowRouteRule, AutomationStudioFlowRouter, AutomationStudioSubflowRole, AutomationStudioFlowSubflow } from "../../../flows/authoring/routing/index.ts";

export type AutomationStudioInstructionScope = InstructionScope;

export type AutomationStudioInstructionTag = InstructionTag;

export type AutomationStudioInstructionRequirement = InstructionRequirement;

export type AutomationStudioFlowInstruction = FlowInstruction;

export type AutomationStudioChangeProposalMode = ExecutableChangeProposalMode;

export type AutomationStudioChangeProposalStatus = ExecutableChangeProposalStatus;

export type AutomationStudioChangeProposalKind = ExecutableChangeProposalKind;

/**
 * The durable form of a unit repair (state-aware recovery plan, C12), the two
 * kinds an in-run repair keeps (C6 step 8). Both are applied by the unit repair
 * applier (`runtime/service/adaptations/unit-repair-apply.ts`) through the same
 * overlay the run used, so the saved graph gets exactly what the judged run ran.
 *
 * - `add_handler`: `targetId` is the node the failure was met at, where the
 *   handler is named and drawn; `after` is the handler as the repair wrote it
 *   (`event`, `scope`, `when`, `completionCheck`, `steps`, `then`). A scope of
 *   `{ kind: "automation" }` is written into the automation's `recovery`
 *   Subflow graph (C4).
 * - `replace_unit`: `targetId` is the unit's id (a node's, a Handler node's, or
 *   a part's Subflow id); `after` is `{ unit, steps?, handler?, failedEdgeTo? }`;
 *   `before.unitDigest` is the unit's digest in the graph the repair was made
 *   on, and the apply is refused when the saved unit no longer has it.
 *
 * Either kind is refused when it would change any unit but the one it names.
 */
export type AutomationStudioUnitRepairChangeKind = Extract<AutomationStudioChangeProposalKind, "add_handler" | "replace_unit">;

/**
 * One action node a deterministic recovery path inserts into the graph it
 * repairs. It is a whole node, not a hint: a definition the node runtime can
 * dispatch, the parameters it runs with, the target it acts on, and the
 * expectation its transition is compared against. `edit_recovery` carried only
 * `actionDefinitionIds`, which named definitions but said nothing about what to
 * run them on, so no applier could build a node from it.
 *
 * `target` is written through `actionTargetParameterValues`, so a policy action
 * is re-pointed inside its output payload exactly as an `edit_action_target`
 * patch re-points one, and `expectation` merges over the parameters.
 */
export type AutomationStudioDeterministicPathNode = {
  nodeId: string;
  definitionId: string;
  definitionVersion?: string;
  label?: string;
  parameters?: JsonObject;
  target?: JsonValue;
  expectation?: JsonObject;
};

/**
 * The `after` value of an `insert_deterministic_path` patch: the nodes to
 * insert, and optionally the node the path rejoins once they succeed.
 *
 * The patch's `targetId` is the node that failed. Applying it wires that node's
 * `failed` port into `nodes[0]`, chains each node's `success` port into the
 * next and, when `returnToNodeId` is set, chains the last node's `success` port
 * back into that node. Every inserted node is therefore reachable from the
 * failure it recovers, and only from it, so the recovery ladder's existing
 * `deterministic_path` candidate picks the new failed edge up with no executor
 * change at all.
 */
export type AutomationStudioDeterministicPath = {
  nodes: AutomationStudioDeterministicPathNode[];
  returnToNodeId?: string;
};

export type AutomationStudioChangeProposalPatch = ChangeProposalPatch;

export type AutomationStudioFlowChangeProposal = {
  schemaVersion: "0.1";
  proposalId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  sourceRunId?: string;
  sourceAdaptationId?: string;
  sourceInstructionIds?: string[];
  mode: AutomationStudioChangeProposalMode;
  status: AutomationStudioChangeProposalStatus;
  riskLevel: AutomationStudioAdaptationRiskLevel;
  patches: AutomationStudioChangeProposalPatch[];
  createdBy: "user" | "runtime" | "llm" | "system";
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunStatus = ExecutableFlowRunStatus;

export type AutomationStudioFlowInterventionSummary = {
  interventionId: string;
  kind: AutomationStudioRuntimeInterventionKind;
  reason: string;
  promptVersion?: string;
  provider?: string;
  model?: string;
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
};

export type AutomationStudioFlowRunSummary = {
  schemaVersion: "0.1";
  runId: string;
  flowId: string;
  projectId: string;
  flowVersion?: string;
  status: AutomationStudioFlowRunStatus;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
  routeDecisionCount: number;
  subflowEntryCount: number;
  actionAttemptCount: number;
  interventionCount: number;
  adaptationCount: number;
  /**
   * Whether the run left the Flow behaving differently from now on
   * (`automationStudioRunChangedDurableBehavior`). Set on every summary saved
   * from a run detail; absent only on one saved before the field existed, which
   * `list-flow-runs` answers as false.
   */
  durableBehaviorChanged?: boolean;
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
  interventionSummaries?: AutomationStudioFlowInterventionSummary[];
  /** The run's retries, planned fails and true failures, counted from its recovery incidents. Set on every summary built from a run's session. */
  failureCounts?: AutomationStudioFlowRunFailureCounts;
  metadata?: JsonObject;
};

/**
 * What a run's failures came to, counted separately (state-aware recovery
 * plan, C6, C7), from the recovery incidents its trace carries rather than
 * from attempt stamps: `retries` is every retry an incident spent;
 * `plannedFails` the incidents an On Fail path or a handler took on to another
 * node, resolved, or led to an authored stop; `trueFailures` the incidents
 * nothing moved on, the only trigger for in-run repair, whether the run then
 * repaired them in place or not; `repairedInRun` those of them a fix made in
 * the run took the run past (C6 step 8). A run that met no failure counts
 * zero of each.
 */
export type AutomationStudioFlowRunFailureCounts = {
  retries: number;
  plannedFails: number;
  trueFailures: number;
  repairedInRun: number;
};

export type AutomationStudioRouteDecisionRecord = ExecutableRouteDecision;

export type AutomationStudioSubflowExecutionRecord = {
  entryId: string;
  subflowId: string;
  enteredAt: number;
  exitedAt?: number;
  status: AutomationStudioFlowRunStatus;
  metadata?: JsonObject;
};

export type AutomationStudioRuntimeInterventionKind =
  | "diagnosis"
  | "runtime_patch"
  | "router_patch"
  | "subflow_patch"
  | "expectation_patch"
  | "instruction_suggestion"
  | "change_proposal";

export type AutomationStudioFlowIntervention = {
  schemaVersion: "0.1";
  interventionId: string;
  runId: string;
  flowId: string;
  projectId: string;
  kind: AutomationStudioRuntimeInterventionKind;
  reason: string;
  promptVersion?: string;
  provider?: string;
  model?: string;
  instructionIds?: string[];
  contextSummary?: JsonObject;
  structuredResult?: JsonObject;
  validation?: { ok: boolean; issues?: string[] };
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
  createdAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunActionAttemptRecord = {
  /** Exact-target observation from the performed attempt, independent of its outcome. */
  actionability?: AutomationStudioTargetActionabilityRecord;
  attemptId: string;
  nodeId: string;
  definitionId: string;
  order: number;
  status: AutomationStudioFlowRunStatus | "unknown";
  route?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  comparisonStatus?: string;
  message?: string;
  /** Structured failure recorded on the attempt. Stored records are parsed again before use. */
  failure?: AutomationStudioFailureRecord;
  /**
   * Set when the run skipped this node rather than ran it: a sometimes-present
   * step (a popup, a banner, a consent prompt) whose target was observed not to
   * be on the page. The attempt then reads `status: "succeeded"`, `route:
   * "skipped"` and carries no `failure`. `code` is what observed the absence:
   * the host's failure code (`web.target.not_found`), or
   * `executor.ready_state.not_shown` when nothing was dispatched.
   *
   * Or a step the run could not run and passed over by reading the page's
   * state (`state_routed`, t243): the attempt reads `route: "state_routed"`,
   * and names the node the run went on to and whether that was `forward` or
   * `backward` in the Flow.
   *
   * Or a lasting act the run already completed (`already_done`, t411): the
   * attempt reads `route: "success"` with the first attempt's outputs, names
   * that attempt, and the row it was done for when the step runs per row
   * (as a person reads it, "Lin Zhao"). It is no failure.
   *
   * Or a press whose control already showed the asked state (`already_in_state`,
   * t775): it was not pressed, which is no failure and no act done earlier in the
   * run; the row is named when the step runs per row.
   */
  skipped?:
    /** `notDone`: the step does a lasting act, and the page did not show its effect, so the act was not done (r4b F4, `step-skip/act-not-done.ts`). */
    | { reason: "target_absent"; code: string; notDone?: true }
    | { reason: "state_routed"; code: string; toNodeId: string; direction: "forward" | "backward" }
    | { reason: "already_done"; code: string; attemptId: string; row?: string }
    | { reason: "already_in_state"; code: string; row?: string };
  /**
   * Set when the step failed but the state it was recorded to produce already
   * held, so the run went on down `success` rather than repeat an act that had
   * already happened (the executor's `skip_satisfied_node` rung). The record
   * then reads `status: "succeeded"` down `route: "success"`, because the step
   * is done, and keeps the attempt's `failure` and `message`, because its
   * first try did fail.
   */
  stateHeld?: { rung: "skip_satisfied_node" };
  /**
   * What state routing made of the page when this step could not run (t243,
   * `runtime/executor/state-routing/`), as closed words and node ids only:
   * never a reason sentence, page text, a signature or a count.
   *
   * - `routed` / `effect_holds`: the step was passed over, and `skipped`
   *   already says where the run went, which way and on which code; this only
   *   tells a page that matched the destination's starting page (`routed`)
   *   from one that already showed the step's own effect (`effect_holds`).
   * - `guard_stopped`: the page matched `toNodeId` once too often without
   *   progress, so the run ended failed.
   * - `no_match`, `unobserved`, `no_pre_states`: no way on was found, and the
   *   step went on to fail or be recovered as before.
   *
   * `code` is the Core code that asked: `executor.ready_state.not_shown` when
   * the step's readiness gate did not hold, else the attempt's failure code.
   * It is absent when that code is not in the shape of a Core code.
   *
   * `refused` lists each matched way on a safety guard refused (t387), as the
   * guard's closed code and the node it led to, in ranked order; absent when
   * none was. A `no_match` with `refused` matched a node the run could not
   * safely go to, not nothing.
   *
   * `noMatchCause` (t661) says why a `no_match` found no way on, as a closed
   * code (`AutomationStudioFlowRunStateRouteNoMatchCause`); absent on any other
   * outcome, and on a record saved before it existed.
   */
  stateRouting?:
    | { outcome: "routed" | "effect_holds"; refused?: AutomationStudioFlowRunStateRouteRefusal[] }
    | { outcome: "guard_stopped"; code?: string; toNodeId: string; refused?: AutomationStudioFlowRunStateRouteRefusal[] }
    | { outcome: "no_match" | "unobserved" | "no_pre_states"; code?: string; refused?: AutomationStudioFlowRunStateRouteRefusal[]; noMatchCause?: AutomationStudioFlowRunStateRouteNoMatchCause };
  /** The invocation ids of the frames this attempt ran in, outermost first (C1). */
  framePath?: string[];
  /** What this attempt's failure counted as (C6); absent on an attempt that did not fail. */
  failureClass?: AutomationStudioFlowRunFailureClass;
  /** Where the frame began, on a frame's first attempt only (C2). */
  entry?: AutomationStudioFlowRunEntryRecord;
  /** The lifecycle handler that ran at this attempt, when one did (C3, C5). */
  lifecycle?: AutomationStudioFlowRunLifecycleRecord;
  /**
   * On a Call Subflow attempt that ran a part: the part's Subflow, its graph,
   * and the revision it ran at (C1). The part's attempts follow this one in the
   * detail, each naming it as `parentAttemptId`, so this attempt is their
   * container and is not counted as a step of its own.
   */
  subflowTarget?: { subflowId: string; graphFlowId: string; graphRevision: number | null };
  /**
   * On an attempt a called part's frame ran: the `attemptId` of the Call
   * Subflow attempt that called the part. Absent on the root frame's attempts,
   * which are the only ones a reader acting on the Flow's own nodes reads: a
   * part's node can share an id with one of them. Its `attemptId` is unique in
   * the run and its id in its own frame's trace is `metadata.traceAttemptId`.
   */
  parentAttemptId?: string;
  metadata?: JsonObject;
};
import type { AutomationStudioFlowRunStateRouteNoMatchCause } from "../../../flows/executable/execution/index.ts";
export type { AutomationStudioFlowRunStateRouteNoMatchCause } from "../../../flows/executable/execution/index.ts";


/** One way on state routing refused: the guard's closed code and the node the route led to. */
export type AutomationStudioFlowRunStateRouteRefusal = { guard: "unbound_value" | "repeats_lasting_act" | "not_checkpoint" | "checkpoint_when_not_true" | "ready_state_not_true"; toNodeId: string };

export type AutomationStudioFlowRunRecoveryRecord = {
  recoveryId: string;
  attemptId: string;
  nodeId: string;
  selectedKind?: string;
  selectedTargetNodeId?: string;
  selectedEdgeId?: string;
  candidateCount: number;
  reason?: string;
  status: "selected" | "exhausted" | "diagnosis_only";
  createdAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunDetail = {
  schemaVersion: "0.1";
  summary: AutomationStudioFlowRunSummary;
  inputs?: JsonObject;
  startingStateRefs?: StateFactReference[];
  routeDecisions: AutomationStudioRouteDecisionRecord[];
  subflows: AutomationStudioSubflowExecutionRecord[];
  actionAttempts?: AutomationStudioFlowRunActionAttemptRecord[];
  recoveryAttempts?: AutomationStudioFlowRunRecoveryRecord[];
  /** Each lifecycle handler execution, folded from the runtime stream's `handler_execution` events. Absent when none ran. */
  handlerExecutions?: AutomationStudioFlowRunHandlerExecutionRecord[];
  /** The run's retries, planned fails and true failures, from its recovery incidents; set on every detail built from a run's session. */
  failureCounts?: AutomationStudioFlowRunFailureCounts;
  interventions: AutomationStudioFlowIntervention[];
  adaptationIds: string[];
  changeProposalIds: string[];
  evidence?: EvidenceReference[];
  /** The datasets the run stored, read from the run dataset store. Absent when the run stored none. */
  datasets?: AutomationStudioRunDatasetSummary[];
  metadata?: JsonObject;
};

export type AutomationStudioAdaptationRiskLevel = ExecutableAdaptationRiskLevel;

export type AutomationStudioFlowAdaptationStatus = ExecutableAdaptationStatus;

/** Which of the three ways into the flow-improvement loop produced a change. */
export type AutomationStudioFlowChangeEntryPoint = ExecutableChangeEntryPoint;

/**
 * Where a change came from, whichever entry point produced it. A Flow
 * adaptation keeps it at `metadata.origin`, which the typed store saves whole,
 * so it needs no migration; a Flow Bootstrap adaptation keeps it at `origin`.
 * Ids and Core failure signatures only, never page text or values.
 * `parseAutomationStudioFlowChangeOrigin` is the only reader of a stored one.
 */
export type AutomationStudioFlowChangeOrigin = ExecutableChangeOrigin;

/**
 * How a validation result was observed: a `trial` of the candidate on the live
 * page before it was saved, or a `replay`, a later run that exercised the
 * applied change with no model call. A result written before kinds existed
 * has none and reads as `trial`. A structural check is never a validation
 * result; it stays in `metadata.structuralChecks`.
 */
export type AutomationStudioFlowChangeValidationKind = ExecutableChangeValidationKind;

/** One observed run of a change. */
export type AutomationStudioFlowAdaptationValidationResult = ExecutableAdaptationValidationResult;

export type AutomationStudioFlowAdaptation = FlowAdaptationRecord;

import type { AutomationStudioFlowExpansionReferences } from "../../../flows/authoring/flow/index.ts";
export type { AutomationStudioFlowExpansionReferences };

export type AutomationStudioFlowExpansionInventory = {
  scope: AutomationStudioFlowScope;
  router?: AutomationStudioFlowRouter;
  subflows?: AutomationStudioFlowSubflow[];
  instructions?: AutomationStudioFlowInstruction[];
  changeProposals?: AutomationStudioFlowChangeProposal[];
  adaptations?: AutomationStudioFlowAdaptation[];
  policy?: AutomationStudioAdaptationPolicy;
};
import type { AutomationStudioFlowRunLifecycleEvent } from "../../../flows/executable/execution/index.ts";
export type { AutomationStudioFlowRunLifecycleEvent } from "../../../flows/executable/execution/index.ts";


/** A three-valued fact answer: `unknown` is never `true`. */
export type AutomationStudioFlowRunFactTruth = "true" | "false" | "unknown";

/** What one condition answered: its truth, a reference to the evidence kept, and when it was captured. */
export type AutomationStudioFlowRunConditionEvidence = { truth: AutomationStudioFlowRunFactTruth; evidenceRef?: string; capturedAt: number };
import type { AutomationStudioFlowRunHandlerDisposition } from "../../../flows/executable/execution/index.ts";
export type { AutomationStudioFlowRunHandlerDisposition } from "../../../flows/executable/execution/index.ts";


/** The lifecycle handler that ran at an attempt. */
export type AutomationStudioFlowRunLifecycleRecord = {
  event: AutomationStudioFlowRunLifecycleEvent;
  handlerId: string;
  occurrence: string;
  conditionEvidence: AutomationStudioFlowRunConditionEvidence[];
  disposition: AutomationStudioFlowRunHandlerDisposition;
  completionCheck: AutomationStudioFlowRunFactTruth;
};

/** Where a frame began, on its first attempt: `id` names the entry or checkpoint. */
export type AutomationStudioFlowRunEntryRecord = {
  kind: "default" | "entry" | "checkpoint";
  id?: string;
  evidence: AutomationStudioFlowRunConditionEvidence[];
};

/** What a failed attempt counted as (C6): only `true_failure` reaches in-run repair. */
export type AutomationStudioFlowRunFailureClass = "true_failure" | "planned_fail" | "retry" | "skip" | "state_route" | "uncertain";
import type { AutomationStudioFlowRunHandlerExecutionRecord } from "../../../flows/executable/execution/index.ts";
export type { AutomationStudioFlowRunHandlerExecutionRecord } from "../../../flows/executable/execution/index.ts";
