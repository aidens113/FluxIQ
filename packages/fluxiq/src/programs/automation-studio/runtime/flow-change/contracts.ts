// The shared contract of one Flow change, whichever way into the
// flow-improvement loop produced it (an instruction, a run failure, or an edge
// case in an existing Flow): the verdict a trial reaches, the trial's input and
// result, the confidence tier its saved results earn, and the node-metadata
// keys a change is known by. Domain-neutral: node ids, Core codes and counts
// only, never page text or values. The persisted parts of a change (its origin
// and its validation results) are model types; see `model/flow-adaptation.ts`.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioAdaptationRiskLevel, AutomationStudioFlowAdaptationValidationResult, AutomationStudioFlowChangeValidationKind, AutomationStudioFlowDocument } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioGraphRunStatus } from "../executor/index.ts";

/**
 * What one verdict check looked at.
 *
 * - `changed_node_succeeded`: every attempt of a node the change wrote, where
 *   the trial reached it.
 * - `expected_state`: the host's evaluation of a changed node's declared
 *   `expectedState`.
 * - `expected_route`: a changed node took the route it declares. Never the
 *   route the failure being repaired took.
 * - `expected_outputs`: a changed node produced every output id it declares.
 * - `records`: a changed node that saves records captured at least its minimum.
 * - `downstream_assertion`: a node whose definition declares
 *   `metadata.verifiesState`, run after the first changed attempt, succeeded.
 * - `continuation`: the route the last changed node took led to a node that
 *   started, or to a successful end.
 */
export type AutomationStudioChangeVerdictCheckKind =
  | "changed_node_succeeded"
  | "expected_state"
  | "expected_route"
  | "expected_outputs"
  | "records"
  | "downstream_assertion"
  | "continuation";

/** The check kinds that count as evidence. Success alone and continuation never do. */
export type AutomationStudioChangeVerdictEvidenceKind = Exclude<AutomationStudioChangeVerdictCheckKind, "changed_node_succeeded" | "continuation">;

/** `unknown` is never a pass: a check that could not be evaluated proves nothing. */
export type AutomationStudioChangeVerdictCheckStatus = "passed" | "failed" | "not_applicable" | "unknown";

export type AutomationStudioChangeVerdictCheck = {
  kind: AutomationStudioChangeVerdictCheckKind;
  status: AutomationStudioChangeVerdictCheckStatus;
  nodeId?: string;
  /** A Core code, never prose or page text. */
  code?: string;
};

/**
 * - `verified`: every changed node the trial reached succeeded, no check
 *   failed, and at least one evidence check passed.
 * - `contradicted`: a check failed.
 * - `unverifiable`: nothing failed, but nothing proved the change either.
 * - `not_executed`: the trial never ran a changed node.
 */
export type AutomationStudioChangeVerdictOutcome = "verified" | "contradicted" | "unverifiable" | "not_executed";

/** Where a run continues after a verified change: the node the changed path led to and the route that led there, or a finished run. */
export type AutomationStudioChangeResumePoint = { nodeId: string; route: string } | { completed: true };

export type AutomationStudioChangeVerdict = {
  schemaVersion: "automation-studio.change-verdict.v1";
  outcome: AutomationStudioChangeVerdictOutcome;
  /** The evidence kinds that passed, in canonical order. Non-empty exactly when `outcome` is `verified`. */
  basis: AutomationStudioChangeVerdictEvidenceKind[];
  checks: AutomationStudioChangeVerdictCheck[];
  /** Present only on a `verified` verdict whose continuation passed. */
  resumeFrom?: AutomationStudioChangeResumePoint;
  /** Core's sentence. */
  reason: string;
};

/**
 * One trial attempt, as the verdict reads it. The trial projects each executor
 * attempt into this shape; every field is a fact the trial observed, and an
 * absent optional field means the node declared nothing of that kind.
 */
export type AutomationStudioChangeVerdictAttempt = {
  nodeId: string;
  status: AutomationStudioGraphRunStatus;
  /** The route the attempt took. The executor reads an absent route as `success`. */
  route?: string;
  /** The output ids the attempt produced a value for. */
  outputIds?: readonly string[];
  /**
   * The route the node declares it takes. Only a declaration: never the
   * executor's `failed` fallback for a failed attempt.
   */
  expectedRoute?: string;
  /** The output ids the node declares. */
  expectedOutputIds?: readonly string[];
  /**
   * The host's evaluation of the node's declared `expectedState`: `unknown`
   * when the host could not evaluate it, or the attempt ended before it was
   * evaluated. Absent when the node declares no expected state.
   */
  expectedState?: "passed" | "failed" | "unknown";
  /**
   * For a node that saves records: the rows this attempt stored, and the
   * minimum the node declares, if it declares one. Absent for any other node.
   */
  records?: { captured: number; minimum?: number };
  /** True when the node's definition declares `metadata.verifiesState === true`. */
  verifiesState?: boolean;
};

export type AutomationStudioChangeVerdictInput = {
  /** Every node the change wrote or created. */
  changedNodeIds: readonly string[];
  /** The trial's attempts, in execution order. */
  attempts: readonly AutomationStudioChangeVerdictAttempt[];
  /** The trial run's final status. */
  runStatus: AutomationStudioGraphRunStatus;
  /** The node the trial run ended on (the trace's `currentNodeId`). */
  endNodeId?: string;
  /** The route the failure being repaired took. An expected route equal to it is never evidence. */
  failureRoute?: string;
  /** A Core code naming why the trial did not run, when it did not. */
  notExecutedCode?: string;
};

export type AutomationStudioChangeTrialInput = {
  /** A throwaway: a patched copy, or an in-memory Subflow graph. */
  candidate: AutomationStudioFlowDocument;
  changedNodeIds: readonly string[];
  /** The failed node for a repair; absent means the graph's start. */
  startNodeId?: string;
  /** The executed values at the failure, or the run's inputs. */
  seedValues: Record<string, JsonValue>;
  /** The run's own IO, host runtime, dataset handler, signal and remaining step budget. */
  options: AutomationStudioGraphExecutionOptions;
};

export type AutomationStudioChangeTrialResult = {
  verdict: AutomationStudioChangeVerdict;
  /** Withheld; the only copy that may be stored. */
  savedTrace: AutomationStudioGraphExecutionTrace;
  /** In memory only, for continuing the run. Never persisted. */
  executedTrace: AutomationStudioGraphExecutionTrace;
};

/** High, Medium and Low confidence in the MVP's words are `established`, `provisional` and `unverified`. */
export type AutomationStudioChangeConfidence = "unverified" | "provisional" | "established";

export type AutomationStudioChangeConfidenceInput = {
  validationResults: readonly AutomationStudioFlowAdaptationValidationResult[];
  riskLevel: AutomationStudioAdaptationRiskLevel;
  /** Succeeded replays needed for `established`. Defaults to 2; a high or destructive change needs one more. */
  replaysRequired?: number;
};

export type AutomationStudioChangeConfidenceDecision = {
  tier: AutomationStudioChangeConfidence;
  /** Succeeded trials, ever. */
  trials: number;
  /** Succeeded replays since the last failure: the count that earns `established`. */
  replays: number;
  /** The replays this change needed, after its risk was applied. */
  replaysRequired: number;
  /** The kind of the most recent failed result, if any failed. */
  lastFailure?: AutomationStudioFlowChangeValidationKind;
};

/** The node-metadata key under which every change that writes or creates a node lists its adaptation id. */
export const AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY = "adaptationIds";

/** A node lists at most this many adaptation ids; a longer stored list is malformed, not truncated. */
export const AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT = 8;

/** The node-definition metadata key a verification verb sets to `true`, so its success counts as a downstream assertion. */
export const AUTOMATION_STUDIO_NODE_VERIFIES_STATE_METADATA_KEY = "verifiesState";

/** Bounds one id, so a corrupted metadata string is never copied onto every attempt. */
const ADAPTATION_ID_MAX_LENGTH = 256;

/**
 * True for a string that can be an adaptation id: non-empty, at most 256
 * characters, no surrounding whitespace, and no C0 control character or DEL.
 */
export function isAutomationStudioAdaptationId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > ADAPTATION_ID_MAX_LENGTH || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/**
 * The adaptation ids a node's metadata lists, in order, without duplicates.
 * Undefined when the list is absent, empty, longer than the limit, or holds any
 * entry that is not an adaptation id: a malformed list is ignored whole rather
 * than partly trusted, because a replay reads it as proof of what ran.
 */
export function automationStudioNodeAdaptationIds(metadata: JsonObject | undefined): string[] | undefined {
  const listed = metadata?.[AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY];
  if (!Array.isArray(listed) || listed.length === 0 || listed.length > AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT) return undefined;
  const adaptationIds: string[] = [];
  for (const candidate of listed) {
    if (!isAutomationStudioAdaptationId(candidate)) return undefined;
    if (!adaptationIds.includes(candidate)) adaptationIds.push(candidate);
  }
  return adaptationIds;
}

/**
 * A copy of the node metadata with `adaptationId` appended to its list. The
 * list is append-only: an id already listed keeps its place, a malformed entry
 * is dropped, and past the limit the oldest ids give way, so the list always
 * reads back through `automationStudioNodeAdaptationIds`. Throws for a value
 * that is not an adaptation id, since Core mints every one.
 */
export function withAutomationStudioNodeAdaptationId(metadata: JsonObject | undefined, adaptationId: string): JsonObject {
  if (!isAutomationStudioAdaptationId(adaptationId)) throw new Error("A node can only be stamped with a well-formed adaptation id.");
  const listed = metadata?.[AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY];
  const adaptationIds: string[] = [];
  for (const candidate of Array.isArray(listed) ? listed : []) {
    if (isAutomationStudioAdaptationId(candidate) && !adaptationIds.includes(candidate)) adaptationIds.push(candidate);
  }
  if (!adaptationIds.includes(adaptationId)) adaptationIds.push(adaptationId);
  return {
    ...(metadata ?? {}),
    [AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_METADATA_KEY]: adaptationIds.slice(-AUTOMATION_STUDIO_NODE_ADAPTATION_IDS_LIMIT)
  };
}

/** True only when a node definition's metadata sets `verifiesState` to exactly `true`. */
export function automationStudioDefinitionVerifiesState(metadata: JsonObject | undefined): boolean {
  return metadata?.[AUTOMATION_STUDIO_NODE_VERIFIES_STATE_METADATA_KEY] === true;
}
