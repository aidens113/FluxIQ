import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import type { AutomationStudioRunState } from "./run-state.ts";

/**
 * How recent the page the last attempt ended on must be for the next attempt
 * to be offered it as its own starting page. Well under one page capture's own
 * round trip (about 450 ms in the Lab, run `run-mv5yaapy-8c34bf34`), so the page
 * offered is no older than a fresh capture's reading of it would be. Anything
 * that took longer between the two -- a pace, a readiness wait, an expected
 * state that waited, a retry's backoff -- leaves time for the page to change on
 * its own, and the next attempt reads it again.
 */
const PAGE_ENDED_FRESH_MS = 250;

/**
 * One web step used to cost two page captures: the page after it, then the same
 * page again, a few milliseconds later, before the next step (t480: 25 s of
 * each 58 s trial run). The page an attempt ended on is now offered to the next
 * attempt's `before_action` capture as `previousStateRef` when no other attempt
 * started between them and it arrived moments ago, and a host may answer it
 * rather than read the page again. Every attempt still carries a
 * `beforeAction`: it is the same snapshot, under the ref of the capture that
 * read it. Any attempt's start spends the offer, so a node between the two --
 * one that waits, a Call Flow whose child acts, an interference handler --
 * always leads to a fresh read.
 */
export async function captureHostState(
  options: AutomationStudioGraphExecutionOptions,
  input: { node: AutomationStudioFlowNode; attemptId: string; inputs: Readonly<Record<string, JsonValue>>; point: "before_action" | "after_action" | "after_wait_retry" | "after_patch_test" },
  runState: AutomationStudioRunState
): Promise<AutomationStudioHostStateSnapshotRef | undefined> {
  const ended = input.point === "before_action" ? runState.pageEnded : undefined;
  if (input.point === "before_action") runState.pageEnded = undefined;
  const capture = options.hostRuntime?.captureStateSnapshot;
  if (!capture) return undefined;
  const offered = ended && now(options) - ended.receivedAt <= PAGE_ENDED_FRESH_MS ? ended.ref : undefined;
  try {
    return await Promise.resolve(capture(offered ? { ...input, previousStateRef: offered } : input));
  } catch {
    return undefined;
  }
}

// The host is told about the node that ran, parameters resolved, after the
// action as before it, so a capture or diff keyed on which action ran sees the
// same node on both sides.
export async function enrichAttemptWithHostState(
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  options: AutomationStudioGraphExecutionOptions,
  beforeAction: AutomationStudioHostStateSnapshotRef | undefined,
  hostCapabilities: string[],
  runState: AutomationStudioRunState
): Promise<AutomationStudioNodeAttemptTrace> {
  const afterAction = await captureHostState(options, { node, attemptId: attempt.attemptId, inputs: attempt.inputs, point: "after_action" }, runState);
  runState.pageEnded = afterAction ? { ref: afterAction, receivedAt: now(options) } : undefined;
  const inspectStateDiff = options.hostRuntime?.inspectStateDiff;
  let stateDiff: JsonObject | undefined;
  if (inspectStateDiff && (beforeAction || afterAction)) {
    try {
      stateDiff = await Promise.resolve(inspectStateDiff({
        ...(beforeAction ? { before: beforeAction } : {}),
        ...(afterAction ? { after: afterAction } : {}),
        node,
        attemptId: attempt.attemptId
      }));
    } catch {
      stateDiff = undefined;
    }
  }
  return {
    ...attempt,
    ...(hostCapabilities.length ? { hostCapabilities } : {}),
    ...((beforeAction || afterAction || stateDiff) ? {
      stateRefs: {
        ...(beforeAction ? { beforeAction } : {}),
        ...(afterAction ? { afterAction } : {}),
        ...(stateDiff ? { stateDiff } : {})
      }
    } : {})
  };
}

function now(options: AutomationStudioGraphExecutionOptions): number {
  return options.now?.() ?? Date.now();
}
