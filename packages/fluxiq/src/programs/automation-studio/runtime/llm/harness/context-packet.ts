import { AutomationStudioLlmRequestRefusedError } from "./request-refusal.ts";
import {
  isAutomationStudioAdaptiveFailureClass,
  parseAutomationStudioFailureRecord,
  type AutomationStudioAdaptiveFailureClass
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowRunActionAttemptRecord,
  AutomationStudioFlowSubflow
} from "../../../model/index.ts";
import {
  automationStudioFlowBootstrapCatalogNames,
  buildAutomationStudioFlowBootstrapContext,
  type AutomationStudioFlowBootstrapContext,
  type AutomationStudioFlowBootstrapRoutingContext
} from "../../flow-bootstrap/index.ts";
import type { AutomationStudioConversationTurn } from "../../conversations/index.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../../recovery/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";
import { automationStudioLoopStageInstructions, type AutomationStudioLoopStage } from "../stages/index.ts";
import { packAutomationStudioLlmConversation, type AutomationStudioLlmConversationContext } from "./conversation.ts";
import { automationStudioExecutableTargetKey, screenAutomationStudioLlmEvidence } from "./evidence-screen.ts";
import { packAutomationStudioLlmExploredEvidence, type AutomationStudioLlmExploredEvidenceSlot } from "./explored-evidence.ts";
import { automationStudioLlmDraftEntryWithoutDeniedKeys } from "./draft-screen.ts";
import { automationStudioEvidenceKey, sanitizeAutomationStudioLlmFailureEvidence } from "./failure-evidence.ts";
import { AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION, resolveAutomationStudioLlmInstructions, type AutomationStudioInstructionResolution } from "./instruction.ts";
import { automationStudioWithoutLocators } from "./locator-text.ts";
import type { AutomationStudioLlmDiagnosisFields } from "./structured-response.ts";
import { AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS, type AutomationStudioLlmTaskKind } from "./task-kind.ts";
import type { AutomationStudioLlmHarnessInput, AutomationStudioLlmInRunRepairContext } from "./task-request.ts";

export type AutomationStudioLlmContextPacket = {
  schemaVersion: "0.1";
  taskKind: AutomationStudioLlmTaskKind;
  /** Where this call sits in the loop's fixed order of work, when it is part of
   * one. Absent for a call made outside the protocol. */
  stage?: AutomationStudioLoopStage;
  promptVersion: string;
  projectId: string;
  flowId: string;
  runId?: string;
  subflowId?: string;
  nodeId?: string;
  instructions: AutomationStudioInstructionResolution;
  stateDiffs?: JsonValue[];
  routeHistory?: JsonValue[];
  recentActions?: AutomationStudioLlmRecentActionContext[];
  failureEvidence?: JsonObject;
  /** The pages a recovery's exploration returned, carried to a runtime patch so
   * a control only the exploration revealed can be named in the repair. Every
   * packet, oldest first. A target check reads this list and no other. Runtime
   * patch and re-planning diagnosis only. */
  explorationEvidence?: AutomationStudioLlmExploredEvidenceSlot;
  /** The standardized account of what went wrong: every section whole, and a
   * record of any secret-shaped value that was withheld. Runtime tasks only,
   * like `failureEvidence`. */
  recoveryContext?: AutomationStudioRuntimeRecoveryContext;
  /** The diagnosis the model produced one call earlier, so the stage that is
   * told to carry out the plan it just stated is shown that plan. Runtime
   * patch only. */
  diagnosis?: AutomationStudioLlmDiagnosisFields;
  /** The in-run repair this patch is for: the unit and its contract, the
   * incident, and what the run already tried and did. Runtime patch only, and
   * always beside the instruction that explains it. */
  inRunRepair?: AutomationStudioLlmInRunRepairContext;
  /** The account of what a finished run produced, and of the shape of
   * the Flow that produced it. Carried to the verification, whose whole subject
   * it is, and to a runtime diagnosis or patch, because a repair entered from a
   * refuted result is repairing exactly this: the rows the run stored, the
   * columns they carry, and the steps the Flow had to produce them with. */
  resultSummary?: AutomationStudioRunResultSummary;
  /** The thread the person and the automation have been talking in, newest
   * turns, oldest first. Carried to every call that is looking at a finished
   * run -- the verification and the two repair stages: it is the channel the
   * person says what they meant in, and neither a repair nor a judgement that
   * cannot read it can tell a wrong answer from an unexpected one. */
  conversation?: AutomationStudioLlmConversationContext;
  relevantRuns?: JsonObject[];
  relevantAdaptations?: JsonObject[];
  reusableContext?: AutomationStudioReusableLlmContextPacket;
  subflows?: Array<Pick<AutomationStudioFlowSubflow, "subflowId" | "name" | "role" | "status" | "routeTags" | "stability">>;
  availableActions?: JsonObject[];
  flowBootstrap?: ReturnType<typeof buildAutomationStudioFlowBootstrapContext>;
  evidenceLoop?: {
    iteration: number;
    tools: AutomationStudioLlmEvidenceTool[];
    evidence: Array<{ callId: string; toolId: string; value: JsonValue }>;
    decisionSchema: JsonObject;
    completionSchema: JsonObject;
    canComplete: boolean;
  };
  policyGates?: JsonObject;
  metadata?: JsonObject;
};

/**
 * What a run's permission gate lets its actions do, by consequence class. Given
 * to a call whose actions the gate governs, it takes the place of the policy's
 * side-effect flags in `policyGates`: the gate, not those flags, is what
 * decides such an action, and a model told "no external side effects" would
 * avoid the press a person's permission or instruction allowed.
 */
export type AutomationStudioLlmActionPermissions = {
  /** The classes the person permitted this run. */
  granted: readonly AutomationStudioActionConsequence[];
  /** The classes the person's own instruction asks for, as the Flow's build stored them and they still stand. */
  instructed: readonly AutomationStudioActionConsequence[];
};

/**
 * Core's sentence for what happens to any other lasting consequence. Never a
 * model's. The last clause is load-bearing: a diagnosis is told to answer
 * "not achievable" where only a person can settle a step, and told only that a
 * person is asked, it read a press it had not been permitted as exactly that --
 * and ended the recovery with no request, the silent refusal this replaces.
 */
const ACTION_PERMISSIONS_OTHERWISE = "An action with any other lasting consequence is still within reach: when the recovery needs one, the run asks the person for permission at that step instead of taking it. Needing permission never makes a step's result unachievable.";

/**
 * The calls that are looking at a finished run, and so may be shown what it
 * produced and what the person said about it.
 *
 * `loop_verification` judges the result; `runtime_diagnosis` and
 * `runtime_patch` repair a run whose result was judged wrong, and repairing
 * that without being told what it produced is the shape of the defect this set
 * widened to close: the repair was shown the failure and never the answer.
 *
 * **One set, because the two slots it gates answer the same question.** The
 * conversation had its own inline pair of task kinds and left the verification
 * out, so the one call that decides *whether the person got what they meant*
 * was the one call that could not read where they said what they meant. A second
 * list is a second thing to forget to widen; this is the first one's own words
 * applied to both.
 */
const AUTOMATION_STUDIO_FINISHED_RUN_TASK_KINDS: ReadonlySet<AutomationStudioLlmTaskKind> = new Set<AutomationStudioLlmTaskKind>([
  "loop_verification",
  "runtime_diagnosis",
  "runtime_patch"
]);

/** The thread as the packet carries it, or no slot at all when nothing was said. */
function conversationSlot(turns: readonly AutomationStudioConversationTurn[]): { conversation?: AutomationStudioLlmConversationContext } {
  const conversation = packAutomationStudioLlmConversation(turns);
  return conversation ? { conversation } : {};
}

export type AutomationStudioLlmRecentActionContext = Pick<AutomationStudioFlowRunActionAttemptRecord,
  "attemptId" | "nodeId" | "definitionId" | "order" | "status"
> & {
  route?: string;
  durationMs?: number;
  comparisonStatus?: string;
  /** Core's category from the attempt's failure record, when the record parses. Its code and texts are not sent. */
  failureCategory?: AutomationStudioAdaptiveFailureClass;
  /**
   * How many records the step stored, when it stored any.
   *
   * A count, and nothing about what was in them: an integer carries nothing off
   * the page, so it needs no screening, and nothing travels beside it.
   *
   * **Why the judge needs it.** The wrong answer this loop keeps producing has
   * one shape -- a step that was supposed to narrow a result stored the same rows
   * as the step before it. Live runs stored 43 records where 13 were expected,
   * and 55 where fewer were. Shown two consecutive steps holding an identical
   * count, a judge can name the step that failed to narrow; without it the count
   * has to be inferred from a result summary's totals, which cannot say which
   * step produced them. The repair has read it from the same place since
   * `runtime/recovery/repair-context/step-parameters.ts` was written; this is the
   * judge being given the same fact.
   */
  recordCount?: number;
};

/**
 * Every field a recent action may carry. The `satisfies` clause is the point:
 * a field added to the type above and left out here, or listed here and not in
 * the type, fails the type check. The provider used to keep its own copy of
 * this list, and when `failureCategory` was added to the projection that copy
 * was not updated, so every recovery from a failure with a structured record
 * was refused before it was sent.
 */
const RECENT_ACTION_FIELDS = {
  attemptId: true,
  nodeId: true,
  definitionId: true,
  order: true,
  status: true,
  route: true,
  durationMs: true,
  comparisonStatus: true,
  failureCategory: true,
  recordCount: true
} as const satisfies Record<keyof AutomationStudioLlmRecentActionContext, true>;
const RECENT_ACTION_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(RECENT_ACTION_FIELDS));

/**
 * Whether a value is a recent action exactly as `packAutomationStudioLlmContext`
 * projects one: only the fields above, each bounded. A provider checks what it
 * is about to send with this, rather than with a list of its own.
 */
export function isAutomationStudioLlmRecentActionContext(value: unknown): value is AutomationStudioLlmRecentActionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (Object.keys(action).some((key) => !RECENT_ACTION_FIELD_NAMES.has(key))) return false;
  if (typeof action.attemptId !== "string" || typeof action.nodeId !== "string" || typeof action.definitionId !== "string"
    || !Number.isSafeInteger(action.order) || typeof action.status !== "string") return false;
  if ([action.attemptId, action.nodeId, action.definitionId, action.status, action.route, action.comparisonStatus]
    .some((text) => text !== undefined && (typeof text !== "string" || text.length < 1 || text.length > 200))) return false;
  if (action.failureCategory !== undefined && !isAutomationStudioAdaptiveFailureClass(action.failureCategory)) return false;
  // A count is an integer or it is not carried. A float, a negative or a string
  // would be a number the projection did not produce.
  if (action.recordCount !== undefined && (!Number.isSafeInteger(action.recordCount) || (action.recordCount as number) < 0)) return false;
  return action.durationMs === undefined
    || (Number.isSafeInteger(action.durationMs) && (action.durationMs as number) >= 0 && (action.durationMs as number) <= 86_400_000);
}

export function packAutomationStudioLlmContext(input: AutomationStudioLlmHarnessInput): AutomationStudioLlmContextPacket {
  const stage = input.stage;
  // The prompt is versioned by stage as well as by task kind: the same kind
  // asked at "implement" and at "iterate" is a different prompt, and a recorded
  // intervention has to say which one it was.
  const stagedVersion = stage ? `${AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind]}+stage.${stage}` : AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS[input.taskKind];
  // An in-run repair is told something no other patch is, so it is a prompt of
  // its own, and a recorded intervention says so.
  const deniedEvidenceKeys = declaredDeniedEvidenceKeys(input);
  const inRunRepair = input.inRunRepair ? packInRunRepair(input.taskKind, input.inRunRepair, deniedEvidenceKeys) : undefined;
  const promptVersion = inRunRepair ? `${stagedVersion}+in_run_repair` : stagedVersion;
  // Composed here rather than accepted from the caller, so a staged request
  // always carries Core's ordering statement. There is no argument by which a
  // caller, or a domain that replaced every stage, can omit it.
  //
  // Whether the request carries tools is read off the packet this call is
  // building, not asserted by the caller, so the tool policy is attached to a
  // request that really has tools rather than to every call that happens to be
  // gathering. A runtime diagnosis gathers with nothing to call.
  const toolsOffered = input.taskKind === "evidence_tool_decision" && (input.evidenceLoop?.tools.length ?? 0) > 0;
  const stageInstructions = stage ? automationStudioLoopStageInstructions(stage, input.stageInstructions, { toolsOffered }) : [];
  // The in-run repair instruction follows the stage's, and only beside the slot it explains.
  const instructions = resolveAutomationStudioLlmInstructions(
    input,
    inRunRepair ? [...stageInstructions, { ...AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION, tags: [...AUTOMATION_STUDIO_LLM_IN_RUN_REPAIR_INSTRUCTION.tags] }] : stageInstructions
  );
  const catalogContext = (input.taskKind === "flow_bootstrap" || input.taskKind === "evidence_tool_decision") && input.flowBootstrap
    ? buildAutomationStudioFlowBootstrapContext({
      ...(input.flowBootstrap.registry ? { registry: input.flowBootstrap.registry } : {}),
      resolution: input.flowBootstrap.resolution,
      ...(input.flowBootstrap.size ? { size: input.flowBootstrap.size } : {}),
      // Where the Flow starts, when the build was told. It reaches the model
      // through the context and not through the instruction, because no
      // instruction a person writes names it: they say what they want done, and
      // only the caller knows where the Flow is meant to do it.
      ...(input.flowBootstrap.startLocation === undefined ? {} : { startLocation: input.flowBootstrap.startLocation }),
      // Every offered node, whole: the catalog is not fitted to any budget
      // (`../../flow-bootstrap/plan/catalog.ts`).
      instructionText: instructions.instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n")
    })
    : undefined;
  const routing = catalogContext && input.flowBootstrap?.routing ? packRoutingContext(input.flowBootstrap.routing, deniedEvidenceKeys) : undefined;
  const withRouting = catalogContext && routing ? { ...catalogContext, routing } : catalogContext;
  const flowBootstrap = withRouting && input.taskKind === "evidence_tool_decision"
    ? withNamesAndDescribed(withRouting, input.flowBootstrap?.describedNodeIds ?? [])
    : withRouting;
  const packed: AutomationStudioLlmContextPacket = {
    schemaVersion: "0.1",
    taskKind: input.taskKind,
    ...(stage ? { stage } : {}),
    promptVersion,
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    ...(input.nodeId ? { nodeId: input.nodeId } : {}),
    instructions,
    // Page-derived, so carried whole: every state diff and every route visited.
    ...(input.stateDiffs?.length ? { stateDiffs: [...input.stateDiffs] } : {}),
    ...(input.routeHistory?.length ? { routeHistory: [...input.routeHistory] } : {}),
    // Every action the run took, in order, and every relevant run, adaptation,
    // Subflow and available action below: nothing is cut to a count (user,
    // 2026-09-30). These were the last 12 actions, 25 runs, 25 adaptations, 100
    // Subflows and 100 actions. The root frame's actions: a called part's
    // (`parentAttemptId`) are its Call Subflow action's, whose outcome is here,
    // and this closed projection has no field to tell a part's node from the Flow's.
    ...(rootFrameActions(input.runDetail).length ? { recentActions: rootFrameActions(input.runDetail).map(compactRecentActionForLlm) } : {}),
    ...(input.failureEvidence ? { failureEvidence: sanitizeAutomationStudioLlmFailureEvidence(input.taskKind, input.failureEvidence, deniedEvidenceKeys) } : {}),
    // Held to the same task-kind rule as the failure evidence it sits beside: a
    // flow-bootstrap packet describes a Flow that has never run, so a record of
    // how a run failed has no place in it.
    ...(input.recoveryContext && (input.taskKind === "runtime_diagnosis" || input.taskKind === "runtime_patch") ? { recoveryContext: input.recoveryContext } : {}),
    ...(input.diagnosis ? packDiagnosisFields(input.taskKind, input.diagnosis) : {}),
    ...(inRunRepair ? { inRunRepair } : {}),
    // Held to the tasks that are looking at a finished run: the verification
    // that judges its result, and the runtime diagnosis and patch that repair
    // it. A build has produced nothing yet, and an evidence-loop decision is
    // mid-run, so neither carries one.
    ...(input.resultSummary && AUTOMATION_STUDIO_FINISHED_RUN_TASK_KINDS.has(input.taskKind) ? { resultSummary: input.resultSummary } : {}),
    // The same set, and now the same three calls: a Flow that has never run has
    // no thread about a run; the request that repairs one has; and so has the
    // request that judges whether the answer was the one asked for, which is the
    // one question the thread is the evidence for.
    ...(input.conversation?.length && AUTOMATION_STUDIO_FINISHED_RUN_TASK_KINDS.has(input.taskKind)
      ? conversationSlot(input.conversation)
      : {}),
    ...(input.relevantRuns?.length ? { relevantRuns: [...input.relevantRuns] } : {}),
    ...(input.relevantAdaptations?.length ? { relevantAdaptations: [...input.relevantAdaptations] } : {}),
    ...(input.reusableContext ? { reusableContext: sanitizeReusableLlmContextPacket(input.reusableContext, deniedEvidenceKeys) } : {}),
    ...(input.subflows?.length ? { subflows: input.subflows.map(compactSubflowForLlm) } : {}),
    ...(input.availableActions?.length ? { availableActions: [...input.availableActions] } : {}),
    ...(flowBootstrap ? { flowBootstrap } : {}),
    ...(input.taskKind === "evidence_tool_decision" && input.evidenceLoop ? { evidenceLoop: packEvidenceLoop(input.evidenceLoop, deniedEvidenceKeys) } : {}),
    ...(input.policy ? { policyGates: adaptationPolicyGates(input.policy, input.actionPermissions) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
  if (input.explorationEvidence === undefined) return packed;
  return { ...packed, explorationEvidence: packAutomationStudioLlmExploredEvidence(input, input.explorationEvidence, deniedEvidenceKeys) };
}

/**
 * An evidence decision's catalog context, with what it is shown of the catalog:
 * every node by name (`catalogNames`) and, in full, only the nodes this build
 * asked `core.describe_nodes` about or ran (`describedNodes`, in the order first
 * described; an id the catalog does not hold is skipped, and the field is
 * absent while there are none). `nodeCatalog`, `catalogTruncated` and
 * `catalogSelection` stay as they were, because the readers that check a
 * packet read them; only the wire leaves them out
 * (`../deepseek/request-body.ts`). `describedNodes` holds every described
 * node; the wire shows each on the window entry whose result names it under
 * `describedNodes` (the call that described it) and keeps in the head only
 * those no entry names, so a describe never changes the bytes in front of the
 * window (t289-G, W11). The packet's evidence keeps the ids, so the checks
 * that read it never see catalog text.
 */
function withNamesAndDescribed(context: AutomationStudioFlowBootstrapContext, describedNodeIds: readonly string[]): AutomationStudioFlowBootstrapContext {
  const byId = new Map(context.nodeCatalog.map((entry) => [entry.id, entry] as const));
  const seen = new Set<string>();
  const describedNodes = describedNodeIds.flatMap((id) => {
    const entry = byId.get(id);
    if (!entry || seen.has(id)) return [];
    seen.add(id);
    return [entry];
  });
  return {
    ...context,
    catalogNames: automationStudioFlowBootstrapCatalogNames(context.nodeCatalog),
    ...(describedNodes.length ? { describedNodes } : {})
  };
}

/**
 * The routing context, carrying nothing the bound domain denies.
 *
 * The situations are state the host observed, which makes them evidence: a
 * denied key refuses the request as it refuses any evidence, and a value
 * shaped like a credential is left out of its situation -- the path still
 * listed, the value not -- rather than sent.
 */
function packRoutingContext(routing: AutomationStudioFlowBootstrapRoutingContext, deniedKeys: readonly string[]): AutomationStudioFlowBootstrapRoutingContext {
  if (screenAutomationStudioLlmEvidence(routing, deniedKeys).deniedKey) {
    throw new AutomationStudioLlmRequestRefusedError("llm.request.routing_denied_key", "The routing context carries a key the bound domain denies, so the request is refused rather than sent.");
  }
  const situations = routing.situations.map((situation) => ({
    seen: situation.seen,
    state: Object.fromEntries(Object.entries(situation.state).filter(([, value]) => !screenAutomationStudioLlmEvidence(value, deniedKeys).secretShaped))
  }));
  return { ...structuredClone(routing), situations };
}

/**
 * The diagnosis the model produced, as the patch request carries it.
 *
 * Written field by field, never spread. The diagnosis channel is a fixed set of
 * keys for the same reason the response reader has one -- an open object is a
 * way to put arbitrary JSON in front of the next call -- and this is the same
 * list on the way back out. An unrecognized key is dropped, each text is cut to
 * the bound the reader holds it to, each verdict must be one of its three
 * words, and each flag must be a boolean.
 *
 * An empty result is no slot at all: a diagnosis that answered nothing would
 * otherwise cost bytes to say so, and the request already says the diagnosis
 * ran.
 *
 * Two tasks may carry it, and both are continuations of the call that produced
 * it. A runtime patch is shown the plan it was told to carry out. A runtime
 * diagnosis is shown it when the loop re-plans after exploring -- there the
 * model's own earlier answer is the subject of the call, not background to it:
 * it said what it said about a page it had not seen, and the point of the
 * second call is to put that answer and the page in front of it together. Every
 * other task has no diagnosis of its own to be shown, so one arriving there is
 * refused rather than quietly dropped.
 */
function packDiagnosisFields(
  taskKind: AutomationStudioLlmTaskKind,
  diagnosis: AutomationStudioLlmDiagnosisFields
): { diagnosis?: AutomationStudioLlmDiagnosisFields } {
  if (taskKind !== "runtime_patch" && taskKind !== "runtime_diagnosis") throw new AutomationStudioLlmRequestRefusedError("llm.request.diagnosis_misplaced", "The model's diagnosis is carried only to a runtime patch or a re-planning runtime diagnosis request.");
  const verdict = (value: unknown): "yes" | "no" | "unknown" | undefined =>
    value === "yes" || value === "no" || value === "unknown" ? value : undefined;
  // Whole (2026-09-30): it was cut at the 500 characters the reply contract allows.
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value : undefined;
  const flag = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);
  const packed: AutomationStudioLlmDiagnosisFields = {
    ...(text(diagnosis.expected) !== undefined ? { expected: text(diagnosis.expected)! } : {}),
    ...(text(diagnosis.observed) !== undefined ? { observed: text(diagnosis.observed)! } : {}),
    ...(text(diagnosis.changed) !== undefined ? { changed: text(diagnosis.changed)! } : {}),
    ...(verdict(diagnosis.stillAchievable) ? { stillAchievable: verdict(diagnosis.stillAchievable)! } : {}),
    ...(verdict(diagnosis.deterministicRecoveryPossible) ? { deterministicRecoveryPossible: verdict(diagnosis.deterministicRecoveryPossible)! } : {}),
    ...(flag(diagnosis.explorationNeeded) !== undefined ? { explorationNeeded: flag(diagnosis.explorationNeeded)! } : {}),
    ...(flag(diagnosis.patchNeeded) !== undefined ? { patchNeeded: flag(diagnosis.patchNeeded)! } : {})
  };
  return Object.keys(packed).length ? { diagnosis: packed } : {};
}

/**
 * How many entries of each in-run repair history the packet keeps, newest
 * first. The two lists grow with the run (a long loop completes hundreds of
 * acts), and every attempt already reaches the request whole as
 * `recentActions`, so this bounds a copy, not what the model can see.
 */
const IN_RUN_REPAIR_HISTORY_MAX_ENTRIES = 40;

/**
 * The in-run repair slot as the packet carries it, or none: a runtime patch
 * only, like `diagnosis`, and any other task leaves it out, so the instruction
 * that explains it is left out too. The typed fields and no others; the two
 * histories held to their newest entries; nothing shaped like a locator.
 *
 * The builder already screened the contract (`recovery/in-run-repair/unit-contract.ts`)
 * and this applies the same locator screen again. A contract that still
 * carries a credential, or a key the bound domain denies, is withheld rather
 * than sent: it is the one part of the slot authored data reaches. A history
 * entry carrying a credential is dropped and counted. Page text never enters
 * the slot: the page is `failureEvidence`, beside it.
 */
function packInRunRepair(taskKind: AutomationStudioLlmTaskKind, slot: AutomationStudioLlmInRunRepairContext, deniedKeys: readonly string[]): AutomationStudioLlmInRunRepairContext | undefined {
  if (taskKind !== "runtime_patch") return undefined;
  const screened = automationStudioWithoutLocators(structuredClone({
    contract: slot.contract,
    recoveriesTried: slot.recoveriesTried,
    actsCompleted: slot.actsCompleted
  }) as unknown as JsonObject) as unknown as Pick<AutomationStudioLlmInRunRepairContext, "contract" | "recoveriesTried" | "actsCompleted">;
  const contractScreen = screenAutomationStudioLlmEvidence(screened.contract, deniedKeys);
  const contract: AutomationStudioLlmInRunRepairContext["contract"] = contractScreen.deniedKey || contractScreen.secretShaped
    ? { kind: slot.contract.kind, withheld: "screened" }
    : screened.contract;
  const recoveries = newestEntries(screened.recoveriesTried.filter(credentialFree), slot.recoveriesTried.length, slot.omitted?.recoveriesTried);
  const acts = newestEntries(screened.actsCompleted.filter(credentialFree), slot.actsCompleted.length, slot.omitted?.actsCompleted);
  const omitted = {
    ...(recoveries.omitted ? { recoveriesTried: recoveries.omitted } : {}),
    ...(acts.omitted ? { actsCompleted: acts.omitted } : {})
  };
  return {
    unit: { kind: slot.unit.kind, id: slot.unit.id },
    contract,
    incident: automationStudioWithoutLocators(structuredClone(slot.incident) as unknown as JsonObject) as unknown as AutomationStudioLlmInRunRepairContext["incident"],
    failedAttempt: automationStudioWithoutLocators(structuredClone(slot.failedAttempt) as unknown as JsonObject) as unknown as AutomationStudioLlmInRunRepairContext["failedAttempt"],
    recoveriesTried: recoveries.kept,
    actsCompleted: acts.kept,
    ...(Object.keys(omitted).length ? { omitted } : {})
  };
}

/** The newest entries up to the count, and how many were left out: past the count, failing the screen, or already omitted by the caller. */
function newestEntries<Entry>(entries: readonly Entry[], given: number, alreadyOmitted: number | undefined): { kept: Entry[]; omitted: number } {
  const past = Math.max(0, entries.length - IN_RUN_REPAIR_HISTORY_MAX_ENTRIES);
  return { kept: entries.slice(past), omitted: past + (given - entries.length) + (alreadyOmitted ?? 0) };
}

function credentialFree(value: unknown): boolean {
  return !screenAutomationStudioLlmEvidence(value, []).secretShaped;
}

/**
 * The loop's context, carrying nothing the bound domain denies.
 *
 * During a recovery's exploration, `evidence` is whatever the domain's options
 * returned, and it was copied into the request as it stood: the one place a
 * domain's page reached the model without its declared keys applied. It is
 * held to them now, and in the way failure evidence is -- refused, not trimmed.
 * A request carrying a denied key is not built, so no provider is called; the
 * loop that asked ends on the refusal, which is what a failure capture carrying
 * one does too. The refusal names no key and repeats no value.
 *
 * The draft beside the evidence is the one exception, and it is withheld from
 * rather than refused: it is the Flow's own authored parameters, not page
 * payload, and refusing it ended every repair of a Flow whose steps carried a
 * denied key before the repair made a single call (`draft-screen.ts`).
 */
function packEvidenceLoop(
  loop: NonNullable<AutomationStudioLlmHarnessInput["evidenceLoop"]>,
  deniedKeys: readonly string[]
): NonNullable<AutomationStudioLlmContextPacket["evidenceLoop"]> {
  const evidence = loop.evidence.map((item) => automationStudioLlmDraftEntryWithoutDeniedKeys(item, deniedKeys));
  if (evidence.some((item) => screenAutomationStudioLlmEvidence(item.value, deniedKeys).deniedKey)) {
    throw new AutomationStudioLlmRequestRefusedError("llm.request.evidence_denied_key", "Evidence-loop evidence carries a key the bound domain denies, so the decision request is refused rather than sent.");
  }
  return structuredClone({ ...loop, evidence });
}

/**
 * The domain's declaration, or a refusal.
 *
 * Evidence -- a failure capture, explored pages, an evidence loop's gathered
 * results -- and reusable context are where a domain's raw payload can reach
 * the model, and Core cannot name the keys that carry it for a medium it knows
 * nothing about. An absent declaration therefore does not mean "deny nothing";
 * it means nobody said, and the packet would carry whatever the domain
 * happened to capture. So the packet is refused instead of built.
 *
 * `AutomationStudioLlmEvidenceRuntimeBinding.deniedEvidenceKeys` is required,
 * so a bound domain cannot arrive here by omission. This closes the same hole
 * for a caller that assembles a harness input by hand. A domain with nothing
 * to deny declares `[]`, which arrives as an empty list and passes: a claim a
 * reviewer can see, where an absent field is not. The empty list returned
 * last is for a request that carries nothing to check, and never reaches the
 * request: a provider's own check reads the declaration, not this.
 */
function declaredDeniedEvidenceKeys(input: AutomationStudioLlmHarnessInput): readonly string[] {
  if (input.deniedEvidenceKeys !== undefined) return input.deniedEvidenceKeys;
  const gathered = input.taskKind === "evidence_tool_decision" && (input.evidenceLoop?.evidence.length ?? 0) > 0;
  const observed = (input.flowBootstrap?.routing?.situations.length ?? 0) > 0;
  if (input.failureEvidence !== undefined || input.explorationEvidence !== undefined || input.reusableContext !== undefined || gathered || observed) {
    throw new AutomationStudioLlmRequestRefusedError("llm.request.denied_keys_undeclared", "Automation Studio LLM context carrying failure evidence, exploration evidence, gathered evidence-loop evidence or reusable context requires the domain's declared deniedEvidenceKeys; declare [] to deny nothing.");
  }
  return [];
}

function sanitizeReusableLlmContextPacket(packet: AutomationStudioReusableLlmContextPacket, deniedKeys: readonly string[]): AutomationStudioReusableLlmContextPacket {
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  if (packet.schemaVersion !== "automation-studio.reusable-llm-context-packet.v1" || !Array.isArray(packet.items)) throw new AutomationStudioLlmRequestRefusedError("llm.request.reusable_context_invalid", "Reusable LLM context packet is invalid.");
  const ids = new Set<string>();
  const items = packet.items.map((item) => {
    const allowed = ["advisory", "recordId", "contentDigest", "outcome", "reviewerState", "validationState", "sourceRunIds", "sourceAdaptationIds", "promptProjection"];
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !allowed.includes(key)) || item.advisory !== true
      || !/^[A-Za-z0-9._:-]{1,200}$/u.test(item.recordId) || ids.has(item.recordId) || !/^[a-f0-9]{64}$/u.test(item.contentDigest)
      || !["succeeded", "failed", "unknown"].includes(item.outcome) || !["unreviewed", "approved"].includes(item.reviewerState)
      || !["unknown", "validated", "applied"].includes(item.validationState)
      || !safeReusableSourceIds(item.sourceRunIds) || !safeReusableSourceIds(item.sourceAdaptationIds)
      || containsReusableExecutableTarget(item.promptProjection, denied)) throw new AutomationStudioLlmRequestRefusedError("llm.request.reusable_context_invalid", "Reusable LLM context packet is invalid.");
    ids.add(item.recordId);
    return structuredClone(item);
  });
  // Every item, whole: no count or byte limit on what earlier runs learned.
  return { schemaVersion: packet.schemaVersion, items };
}

function safeReusableSourceIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && /^[A-Za-z0-9._:-]{1,200}$/u.test(item));
}

/**
 * Historical context may describe what was done; it may never carry something
 * the model could execute or address directly.
 *
 * Core denies its own vocabulary for that -- the `target` family, which is what
 * a repair addresses in every domain. `selector` and `selectors` used to be in
 * this list too. They are a browser's word for a target and had no business in
 * a framework with no page in it, so they moved to the web domain's declared
 * keys, which arrive as `deniedKeys` and are checked here beside Core's own.
 */
function containsReusableExecutableTarget(value: JsonValue, deniedKeys: ReadonlySet<string>, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsReusableExecutableTarget(item, deniedKeys, seen));
  return Object.entries(value).some(([key, item]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    return automationStudioExecutableTargetKey(key)
      || deniedKeys.has(normalized)
      || containsReusableExecutableTarget(item as JsonValue, deniedKeys, seen);
  });
}

function rootFrameActions(detail: AutomationStudioLlmHarnessInput["runDetail"]): AutomationStudioFlowRunActionAttemptRecord[] {
  return (detail?.actionAttempts ?? []).filter((action) => action.parentAttemptId === undefined);
}

function compactRecentActionForLlm(action: AutomationStudioFlowRunActionAttemptRecord): AutomationStudioLlmRecentActionContext {
  // Stored records are parsed again; only Core's category name reaches the model.
  const failureCategory = parseAutomationStudioFailureRecord(action.failure)?.category;
  return {
    attemptId: action.attemptId,
    nodeId: action.nodeId,
    definitionId: action.definitionId,
    order: action.order,
    status: action.status,
    ...(action.route ? { route: action.route } : {}),
    ...(Number.isSafeInteger(action.durationMs) && action.durationMs! >= 0 && action.durationMs! <= 86_400_000 ? { durationMs: action.durationMs } : {}),
    ...(action.comparisonStatus ? { comparisonStatus: action.comparisonStatus } : {}),
    ...(failureCategory ? { failureCategory } : {}),
    // The step's own record count, read where the repair context already reads
    // it (`runtime/recovery/repair-context/step-parameters.ts`). An integer only:
    // a metadata bag is host-written, so anything else there is not a count.
    ...(Number.isSafeInteger(action.metadata?.recordCount) && (action.metadata!.recordCount as number) >= 0
      ? { recordCount: action.metadata!.recordCount as number }
      : {})
  };
}

function compactSubflowForLlm(subflow: AutomationStudioFlowSubflow): NonNullable<AutomationStudioLlmContextPacket["subflows"]>[number] {
  return {
    subflowId: subflow.subflowId,
    name: subflow.name,
    role: subflow.role,
    status: subflow.status,
    ...(subflow.routeTags?.length ? { routeTags: subflow.routeTags } : {}),
    ...(subflow.stability ? { stability: subflow.stability } : {})
  };
}

/**
 * The policy as the model is told it. Where a permission gate governs the
 * call's actions, the side-effect flags are replaced by what the gate permits:
 * the classes, and what becomes of anything else.
 */
function adaptationPolicyGates(policy: AutomationStudioAdaptationPolicy, permissions: AutomationStudioLlmActionPermissions | undefined): JsonObject {
  const sideEffects: JsonObject = permissions
    ? {
      actionPermissions: {
        permitted: automationStudioConsequencesInOrder([...permissions.granted, ...permissions.instructed]),
        granted: automationStudioConsequencesInOrder([...permissions.granted]),
        instructed: automationStudioConsequencesInOrder([...permissions.instructed]),
        otherwise: ACTION_PERMISSIONS_OTHERWISE
      }
    }
    : { allowExternalSideEffects: policy.allowExternalSideEffects, requireApprovalForExternalSideEffects: policy.requireApprovalForExternalSideEffects };
  return {
    preset: policy.preset,
    allowRuntimeRecovery: policy.allowRuntimeRecovery,
    allowCreateRecoveryPaths: policy.allowCreateRecoveryPaths,
    allowModifySubflows: policy.allowModifySubflows,
    allowCreateSubflows: policy.allowCreateSubflows,
    allowModifyRouter: policy.allowModifyRouter,
    allowModifyExpectations: policy.allowModifyExpectations,
    allowModifyActionTargets: policy.allowModifyActionTargets,
    allowDeleteOrDisableBehavior: policy.allowDeleteOrDisableBehavior,
    requireApprovalForDestructiveChanges: policy.requireApprovalForDestructiveChanges,
    ...sideEffects,
    ...(policy.maxInterventionsPerRun !== undefined ? { maxInterventionsPerRun: policy.maxInterventionsPerRun } : {}),
    ...(policy.maxEstimatedCostUsdPerRun !== undefined ? { maxEstimatedCostUsdPerRun: policy.maxEstimatedCostUsdPerRun } : {})
  };
}
