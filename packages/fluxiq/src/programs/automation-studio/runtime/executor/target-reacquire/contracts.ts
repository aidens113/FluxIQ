// A stale target found again from the step that found it (user rule, 2026-10-28; t786).
//
// A step whose target came from an earlier step -- a read list's row handed to a
// For Each pass, a value bound to another node's output -- remembers that source
// step (its lineage). After the step's second failed retry on a target-class
// failure that never acted, the run re-runs the source step internally, asks the
// host to find the same item among its fresh answer by identity (never by its old
// position or handle), and spends the remaining retries on the fresh target. An
// item the host finds gone is reported as gone. Core owns the lineage, the
// trigger, the re-run, the rebinding and the attempt accounting; the host owns
// how one item is matched again in its medium.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";

/**
 * Where a step's target came from: `row` when a For Each pass handed it the row
 * (`item`) of a list another node answered; `output` when one of its parameters
 * is bound (`$node.<key>.<output>`) to another node's answer.
 */
export type AutomationStudioTargetLineage = {
  kind: "row" | "output";
  /** The node whose answer the target came from: the read, the search, the look-up. Re-run read-only. */
  sourceNodeId: string;
  /** The source's output the target was taken from (a read's rows, a look-up's element). */
  outputKey: string;
  /** `row`: the For Each whose pass handed the row. */
  loopNodeId?: string;
  /** `output`: the step's parameter bound to the source's answer, as a dotted path. */
  parameterPath?: string;
};

/** What the host is asked: find, among the source's fresh answer, the same item the step was bound to. */
export type AutomationStudioTargetReacquireRequest = {
  /** The step whose target went stale. */
  node: AutomationStudioFlowNode;
  /** The source step, just re-run. Its definition and parameters say how its answer identifies an item (a read's key columns). */
  source: AutomationStudioFlowNode;
  lineage: AutomationStudioTargetLineage;
  /** What the step was bound to: the pass's row, or the bound value. */
  stale: JsonValue;
  /** The source's fresh answer, as candidates: the re-read rows, or the fresh value (each element of it when it is a list). */
  candidates: readonly JsonValue[];
  /** Why the step's last attempt failed. */
  failure: AutomationStudioFailureRecord;
  signal?: AbortSignal;
};

/**
 * The host's answer. `found`: the one candidate that is the same item, by identity.
 * `gone`: no candidate is it, and the source's answer is whole enough to say so.
 * `unmatched`: it cannot tell (`ambiguous`: more than one candidate could be it;
 * `unidentifiable`: the stale value carries too little identity to match on).
 */
export type AutomationStudioTargetReacquireAnswer =
  | { outcome: "found"; value: JsonValue }
  | { outcome: "gone" }
  | { outcome: "unmatched"; reason: "ambiguous" | "unidentifiable" };

/** Asked before the source is re-run: whether the page is still where the source ran, and to go back there if it moved. */
export type AutomationStudioSourcePlaceRequest = {
  node: AutomationStudioFlowNode;
  source: AutomationStudioFlowNode;
  /** The source's own attempt in this run, when the run has one (its outputs and stamps). */
  sourceAttempt?: { attemptId: string; outputs: Readonly<Record<string, JsonValue>>; startedAt: number };
  signal?: AbortSignal;
};

/** `same_place`: re-run here. `returned`: the host went back to where the source ran. `unavailable`: it cannot get there, so no re-run. */
export type AutomationStudioSourcePlaceAnswer = "same_place" | "returned" | "unavailable";

/** What a re-acquire came to, stamped on the attempt that followed it (or on the synthesized attempt of a gone item). */
export type AutomationStudioTargetReacquireRecord = {
  sourceNodeId: string;
  kind: AutomationStudioTargetLineage["kind"];
  /** `unavailable`: no host matcher, the source could not be re-run, or its place could not be reached. */
  outcome: "found" | "gone" | "unmatched" | "unavailable";
  reason?: string;
  /** Whether the host went back to where the source ran first. */
  returned?: true;
  at: number;
};
