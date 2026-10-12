import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioChangeProposalPatch } from "../../../model/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { isJsonValue, isRecord } from "./json-bounds.ts";
import type { AutomationStudioFactCondition } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioHandlerDispositionKind, AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";

import type { AutomationStudioFlowDraftAmendment } from "../../flow-draft/index.ts";

export type AutomationStudioLlmStructuredResponse =
  | { kind: "flow_bootstrap"; summary: string; plan: AutomationStudioFlowBootstrapPlan; metadata?: JsonObject }
  | { kind: "evidence_tool_decision"; summary: string; decision: { kind: "tool_call"; callId: string; toolId: string; input: JsonObject; add?: true; act?: string; place?: string } | { kind: "complete"; result: JsonObject } | { kind: "amend_draft"; amendments: AutomationStudioFlowDraftAmendment[] }; metadata?: JsonObject }
  | { kind: "diagnosis"; summary: string; confidence?: number; diagnosis?: AutomationStudioLlmDiagnosisFields; metadata?: JsonObject }
  | { kind: "runtime_patch"; summary: string; patches: AutomationStudioRuntimePatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "no_repair"; summary: string; reason: AutomationStudioNoRepairReason; metadata?: JsonObject }
  | { kind: "change_proposal"; summary: string; patches: AutomationStudioChangeProposalPatch[]; riskLevel: "low" | "medium" | "high" | "destructive"; metadata?: JsonObject }
  | { kind: "instruction_suggestion"; summary: string; instructions: Array<{ title: string; body: string; scope?: JsonObject; tags?: string[] }>; metadata?: JsonObject };

/**
 * Why there is nothing to repair, in the five ways a page says no.
 *
 * A model asked for a runtime patch had no way to answer "there is no repair":
 * on a `diagnose_and_adapt` run the schema was one target override with at
 * least one handle and no other shape, so the only schema-valid answer was a
 * control -- and in the live repair campaign of 2026-09-17 every refusal task
 * came back with one that was merely pressable. This is the answer that was
 * missing. It is a closed list because a reason a run records is read by a
 * person and matched on by the Lab, and free prose is neither.
 *
 * It is deliberately not the target-override refusal vocabulary
 * (`runtime/live-patch/refusal-reasons.ts`): those words say why a domain
 * refused a target the model proposed, and these say why the model proposed
 * none. A refusal Core reached and a refusal the model reached are different
 * facts about a run.
 */
export const AUTOMATION_STUDIO_NO_REPAIR_REASONS = Object.freeze({
  control_gone: "what the step acted on is gone, and nothing takes its place",
  control_refused: "it is still there and refuses the step on purpose: locked, read-only, guarded, or not signed in",
  several_alike: "several things answer to the step's own description and nothing tells them apart",
  destination_gone: "where the step led is gone, and nothing replaces it",
  person_required: "only a person can settle this"
} as const);

export type AutomationStudioNoRepairReason = keyof typeof AUTOMATION_STUDIO_NO_REPAIR_REASONS;

export function isAutomationStudioNoRepairReason(value: unknown): value is AutomationStudioNoRepairReason {
  return typeof value === "string" && Object.hasOwn(AUTOMATION_STUDIO_NO_REPAIR_REASONS, value);
}

/**
 * The one channel through which a model may contribute to a diagnosis.
 *
 * Every response's `metadata` is stripped on the way in, deliberately: it is an
 * open field and an open field is a way to smuggle arbitrary JSON past the
 * recognized-field allowlist. That left no channel at all, so the structured
 * diagnosis the runtime builds was entirely Core's own verdicts and the model's
 * answer was a sentence of prose nobody could act on.
 *
 * This is the narrow replacement: a named field, with a fixed set of keys, each
 * bounded to a value Core can check without knowing anything about the medium
 * the failure happened in. It is a channel, not an opening -- `metadata` is
 * still stripped, and an unrecognized key inside `diagnosis` is still refused.
 */
export type AutomationStudioLlmDiagnosisFields = {
  /** What the run was supposed to achieve, in the model's words. */
  expected?: string;
  /** What it observed instead. */
  observed?: string;
  /** What the model thinks changed between the two. */
  changed?: string;
  /** Whether the goal is still reachable. Core refuses an answer here that would talk it past a control a person must clear. */
  stillAchievable?: "yes" | "no" | "unknown";
  /** Whether a deterministic recovery Core already holds would serve. */
  deterministicRecoveryPossible?: "yes" | "no" | "unknown";
  /** Whether more evidence is needed before anything is changed. */
  explorationNeeded?: boolean;
  /** Whether a change to the Flow is needed at all. The one field that can stop the patch call. */
  patchNeeded?: boolean;
  /**
   * Whether the result a finished run produced answers what was asked for.
   *
   * The one field a `loop_verification` call is made for, and the reason that
   * call needs no response kind of its own: it is the same three words as the
   * two verdicts above, read the same way. `yes` answers, `no` does not, and
   * `unknown` -- like an omitted field -- is a run nobody confirmed, which the
   * result verification fails closed on rather than letting it read as a pass.
   */
  answersRequest?: "yes" | "no" | "unknown";
};

/**
 * The bound on each description the model may supply.
 *
 * It is the same 500 characters the runtime's reader holds the field to, stated
 * here as well because the two checks answer different questions: this one
 * refuses the response at the boundary, and the reader's records a refusal on
 * the run. A reader that is the only bound would accept an oversized field into
 * the process first.
 */
export const AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH = 500;

/**
 * The vocabulary an opaque handle may use, and nothing wider.
 *
 * A handle is a name, not a path: no whitespace, no brackets, no quotes, no
 * combinators, no slashes, no parentheses. That is deliberately narrower than
 * "a bounded string", because the whole point of the handle is that it cannot
 * carry structure. A domain that wants to say *where* something is says it in
 * its own resolution, on the domain's side of this boundary, never here.
 */
export const AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN = "^[A-Za-z0-9](?:[A-Za-z0-9_.:-]*[A-Za-z0-9])?$";
export const AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH = 64;
export const AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES = 16;
export const AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH = 4_000;

const AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_EXPRESSION = new RegExp(AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN, "u");

/**
 * A repair target, opaque to Core.
 *
 * `handles` is the only part of it Core and a domain agree on: a map from a
 * repairable parameter the domain declared -- one control to re-point, or a
 * list row and its fields for an extraction -- to an opaque handle the domain
 * minted and named in the evidence it issued. Core bounds both sides of that
 * map and reads neither. What a handle points at is the domain's business.
 *
 * Every other key is the domain's own resolution of those handles, in the
 * domain's own vocabulary, written only after the domain has checked the
 * handle against evidence it actually issued. Core carries it and never looks
 * inside, which is what makes this type domain-neutral rather than a browser
 * concept wearing a neutral name: it was `{ selector: string }`, and a
 * non-browser domain had no way to answer it.
 *
 * A model-authored target carries `handles` and nothing else. That is not a
 * convention, it is enforced twice --
 * `isAutomationStudioModelAuthoredTargetOverrideTarget` at the provider and at
 * output validation, and `additionalProperties: false` in the response schema
 * -- so a locator can never enter through the model, only through a domain
 * that resolved one from its own evidence.
 */
export type AutomationStudioRuntimeTargetOverrideTarget = JsonObject & {
  handles: Record<string, string>;
};

/**
 * One step a repair inserts into a Flow, as a model writes it.
 *
 * `temporary_action_sequence` carried `actionDefinitionIds: string[]` --
 * definition ids and nothing else. No applier could build a node from that, so
 * the kind had no application at all (`live-patch.ts` refused it as
 * `unapplied_patch_kind`) and the change-proposal kind it mapped to,
 * `edit_recovery`, is refused outright as having no durable form
 * (`adaptation-store.ts`). The one shape of failure the loop meets most often
 * -- a Flow that ran cleanly and answered wrongly because a step is missing --
 * therefore had no patch kind that could express its repair. Live run
 * `run-mufvlasz-c83071f7` (2026-09-24) is the case: a catalog search Flow that
 * navigated and extracted, never typed the query, and returned 23 records where
 * 4 were expected.
 *
 * A step is therefore a whole node: what to run, and what to run it with. Its
 * `parameters` are the node's parameter values, written exactly as the
 * authoring path writes them for a node it creates, and validated by the same
 * registry the executor dispatches through. Nothing here is a locator Core
 * reads: a parameter is the definition's own declared parameter, and a
 * definition the registry does not know refuses before any node is inserted.
 */
export type AutomationStudioRuntimePatchStep = {
  /** The node definition to run, named as the catalog the Flow was built from names it. */
  definitionId: string;
  /** What the inserted node is called. Its definition id when absent. */
  label?: string;
  /** The node's parameter values, as the authoring path writes a node's. */
  parameters?: JsonObject;
};

/** How many steps one repair may insert. A repair is a missing step or two, never a second Flow. */
export const AUTOMATION_STUDIO_RUNTIME_PATCH_MAX_STEPS = 8;

/** The bound on one step's serialized size, so a page cannot ride into a graph write inside a parameter. */
export const AUTOMATION_STUDIO_RUNTIME_PATCH_STEP_MAX_SERIALIZED_LENGTH = 8_000;

// ---------------------------------------------------------------------------
// The two kinds an in-run repair may write (state-aware recovery plan, C6 step
// 8 and C12): a scoped handler for an interruption the run met, and the
// replacement of exactly one unit -- a node, a handler, or a part. Both are
// declarative JSON: a handler is the registration `builtin.control.handler`
// stores (`nodes/control-flow/handler.ts`), and its body is the same list of
// whole steps `temporary_action_sequence` inserts. Nothing is code, and no
// expression goes beyond the fact-condition grammar (C9).

/**
 * A lifecycle point a repair may register a handler for: any but `start`. A
 * run that is already past its frame's start has no use for one, and a repair
 * is written for the point the run is at.
 */
export type AutomationStudioRuntimePatchHandlerEvent = Exclude<AutomationStudioLifecycleEvent, "start">;

/**
 * Where a repair's handler applies. Never the whole automation: a learned
 * handler keeps the scope of the place it was learned, and widening it is a
 * separate repair with its own judged run (C12).
 */
export type AutomationStudioRuntimePatchHandlerScope =
  | { kind: "nodes"; nodeIds: string[] }
  | { kind: "subflow"; inherit?: boolean };

/**
 * How the run continues after the handler's body, in the words a model is
 * given, each mapped to one of C5's dispositions: `resume` and `route` as
 * written, `resolve` with the outputs it stands in for, and `give_up` as
 * `unhandled`, which hands the failure on.
 */
export type AutomationStudioRuntimePatchHandlerThen =
  | { kind: "resume" }
  | { kind: "route"; checkpointId: string }
  | { kind: "resolve"; outputs: JsonObject }
  | { kind: "give_up" };

/**
 * One handler as a repair writes it. `completionCheck` is the evidence that
 * the body worked; a `before` or `retry` handler must carry one, and must say
 * in `when` which situation it is for, since it would otherwise run before
 * every attempt in its scope.
 */
export type AutomationStudioRuntimePatchHandlerSpec = {
  event: AutomationStudioRuntimePatchHandlerEvent;
  scope: AutomationStudioRuntimePatchHandlerScope;
  when: AutomationStudioFactCondition[];
  completionCheck?: AutomationStudioFactCondition[];
  steps: AutomationStudioRuntimePatchStep[];
  then: AutomationStudioRuntimePatchHandlerThen;
};

/**
 * The one unit a `replace_unit` repair replaces: a node (by its id), a handler
 * (by its Handler node's id: the registration, its body and its end), or a
 * part (by its Subflow id: the whole graph a Call Subflow node calls).
 */
export type AutomationStudioRuntimePatchUnit =
  | { kind: "node"; nodeId: string }
  | { kind: "handler"; nodeId: string }
  | { kind: "part"; subflowId: string };

/**
 * A scoped handler for the interruption the run met (C4), written as the
 * registration it becomes. `consequences` says what its body's steps would
 * lastingly do, as an inserted sequence's does.
 */
export type AutomationStudioRuntimeAddHandlerPatch = AutomationStudioRuntimePatchHandlerSpec & {
  kind: "add_handler";
  consequences?: AutomationStudioActionConsequence[];
  reason: string;
  metadata?: JsonObject;
};

/**
 * The replacement of exactly one unit (C12): steps for a node or a part, a
 * handler for a handler. A node's replacement may also name an existing node
 * its failure goes to (`failedEdgeTo`), an authored `failed` edge, so the next
 * occurrence of the failure is a planned one and calls no model.
 */
export type AutomationStudioRuntimeReplaceUnitPatch = {
  kind: "replace_unit";
  unit: AutomationStudioRuntimePatchUnit;
  steps?: AutomationStudioRuntimePatchStep[];
  handler?: AutomationStudioRuntimePatchHandlerSpec;
  failedEdgeTo?: string;
  consequences?: AutomationStudioActionConsequence[];
  reason: string;
  metadata?: JsonObject;
};

/**
 * The bounds a model's handler is held to. A handler is a few facts and a
 * step or two, never a second Flow; and a condition is a host path and a
 * small value, never a page.
 */
export const AUTOMATION_STUDIO_RUNTIME_PATCH_HANDLER_BOUNDS = Object.freeze({
  /** Conditions in one `when` or `completionCheck`. */
  maxConditions: 8,
  /** Characters in a condition's `fact`. */
  maxFactLength: 200,
  /** Characters in a condition's string value, or in the name an `{ input }` or `{ value }` reads. */
  maxValueLength: 1_000,
  /** Characters in a node id, a Subflow id or a checkpoint id a repair names. */
  maxIdLength: 200,
  /** Node ids one `nodes` scope may name. */
  maxScopeNodeIds: 16,
  /** Serialized characters of a `resolve`'s outputs. */
  maxResolveOutputsLength: 4_000
} as const);

/** The disposition a handler's `then` is stored as on its Handler End (C5). */
export function automationStudioHandlerThenDisposition(then: AutomationStudioRuntimePatchHandlerThen): AutomationStudioHandlerDispositionKind {
  return then.kind === "give_up" ? "unhandled" : then.kind;
}

/**
 * A runtime patch as a model writes it.
 *
 * `consequences` is what an acting patch says it would lastingly do each time
 * the Flow runs, in Core's classes, `[]` when it only opens, shows or chooses.
 * The schema a model is shown requires it wherever the patch may run, and the
 * recovery's permission gate is asked about it before the patch does. It is
 * optional here because it is read forgivingly: a patch that left it out is
 * recorded as undeclared and does not run, rather than the whole answer being
 * refused, and a proposal-only patch never carries it.
 *
 * `add_handler` and `replace_unit` are the in-run repair's kinds (above),
 * offered only to a request that declares one.
 */
export type AutomationStudioRuntimePatch =
  | { kind: "temporary_action_sequence"; targetNodeId: string; steps: AutomationStudioRuntimePatchStep[]; consequences?: AutomationStudioActionConsequence[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_wait_retry"; targetNodeId: string; timeoutMs?: number; retryCount?: number; reason: string; metadata?: JsonObject }
  | { kind: "temporary_target_override"; targetNodeId: string; target: AutomationStudioRuntimeTargetOverrideTarget; consequences?: AutomationStudioActionConsequence[]; reason: string; metadata?: JsonObject }
  | { kind: "temporary_recovery_subflow_call"; subflowId: string; reason: string; metadata?: JsonObject }
  | { kind: "temporary_reroute"; fromNodeId: string; toNodeId: string; reason: string; metadata?: JsonObject }
  | AutomationStudioRuntimeAddHandlerPatch
  | AutomationStudioRuntimeReplaceUnitPatch;

/**
 * A target Core will carry: bounded handles, and a domain resolution bounded
 * only by size. Core checks that it is JSON and that it is small; it does not
 * and must not check what the domain put in it.
 */
export function isAutomationStudioRuntimeTargetOverrideTarget(value: unknown): value is AutomationStudioRuntimeTargetOverrideTarget {
  if (!isRecord(value) || !isRecord(value.handles) || !isJsonValue(value)) return false;
  const entries = Object.entries(value.handles);
  if (entries.length === 0 || entries.length > AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES) return false;
  if (!entries.every(([parameter, handle]) => isRuntimeTargetHandleToken(parameter) && isRuntimeTargetHandleToken(handle))) return false;
  return serializedLength(value) <= AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH;
}

/**
 * The stricter guard a model's own output must pass: handles, and nothing
 * else. A domain resolution is not something a model may author, so the one
 * place a locator could otherwise reach an executed action is closed here.
 */
export function isAutomationStudioModelAuthoredTargetOverrideTarget(value: unknown): value is AutomationStudioRuntimeTargetOverrideTarget {
  return isRecord(value) && Object.keys(value).length === 1 && Object.hasOwn(value, "handles")
    && isAutomationStudioRuntimeTargetOverrideTarget(value);
}

function isRuntimeTargetHandleToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH
    && AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_EXPRESSION.test(value);
}

function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? Number.POSITIVE_INFINITY;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function stripAutomationStudioLlmResponseMetadata(response: AutomationStudioLlmStructuredResponse): AutomationStudioLlmStructuredResponse {
  if (response.kind === "flow_bootstrap") return { kind: response.kind, summary: response.summary, plan: response.plan };
  if (response.kind === "evidence_tool_decision") return { kind: response.kind, summary: response.summary, decision: response.decision };
  // `diagnosis` is carried and `metadata` is not. The strip stays a named-field
  // allowlist rather than becoming "keep what the model sent": every key inside
  // `diagnosis` was checked by name at the boundary, and `metadata` was not.
  if (response.kind === "diagnosis") return { kind: response.kind, summary: response.summary, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}), ...(response.diagnosis !== undefined ? { diagnosis: response.diagnosis } : {}) };
  if (response.kind === "runtime_patch") {
    return {
      kind: response.kind,
      summary: response.summary,
      riskLevel: response.riskLevel,
      patches: response.patches.map((patch) => {
        const { metadata: _metadata, ...recognized } = patch;
        return recognized;
      })
    };
  }
  if (response.kind === "no_repair") return { kind: response.kind, summary: response.summary, reason: response.reason };
  if (response.kind === "change_proposal") {
    return {
      kind: response.kind,
      summary: response.summary,
      riskLevel: response.riskLevel,
      patches: response.patches.map((patch) => {
        const { metadata: _metadata, ...recognized } = patch;
        return recognized;
      })
    };
  }
  return {
    kind: response.kind,
    summary: response.summary,
    instructions: response.instructions.map((instruction) => ({
      title: instruction.title,
      body: instruction.body,
      ...(instruction.scope ? { scope: instruction.scope } : {}),
      ...(instruction.tags ? { tags: instruction.tags } : {})
    }))
  };
}

export function summarizeAutomationStudioLlmResponse(response: AutomationStudioLlmStructuredResponse): JsonObject {
  if (response.kind === "flow_bootstrap") return { kind: response.kind, subflowCount: response.plan.subflows.length, nodeCount: response.plan.subflows.reduce((count, subflow) => count + subflow.nodes.length, 0), edgeCount: response.plan.subflows.reduce((count, subflow) => count + subflow.edges.length, 0) };
  if (response.kind === "evidence_tool_decision") return { kind: response.kind, decisionKind: response.decision.kind, ...(response.decision.kind === "tool_call" ? { toolId: response.decision.toolId } : {}) };
  if (response.kind === "diagnosis") return { kind: response.kind, ...(response.confidence !== undefined ? { confidence: response.confidence } : {}) };
  if (response.kind === "runtime_patch") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  if (response.kind === "no_repair") return { kind: response.kind, reason: response.reason };
  if (response.kind === "change_proposal") return { kind: response.kind, riskLevel: response.riskLevel, patchCount: response.patches.length, patchKinds: response.patches.map((patch) => patch.kind) };
  return { kind: response.kind, instructionCount: response.instructions.length };
}
