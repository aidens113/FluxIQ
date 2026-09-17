// Decides what a trial of one change proved, per changed node and from observed
// evidence only. The rules:
//
// - `verified` needs every changed node the trial reached to have succeeded,
//   no failed check, and at least one passed evidence check. A node that merely
//   succeeded proves nothing, so on its own it is `unverifiable`.
// - A failure after the changed nodes does not contradict the change. It ends
//   the continuation, and the run can enter the loop again for that node. Only
//   a failed verification node (a downstream assertion) contradicts it.
// - `unknown` is never a pass.
// - An expected route that repeats the route the failure already took is not
//   evidence: matching it again would mean reproducing the failure.
// - A changed node that saves records is checked against what it captured.
import type { AutomationStudioFlowAdaptationValidationResult, AutomationStudioFlowChangeValidationKind } from "../../model/index.ts";
import type {
  AutomationStudioChangeResumePoint,
  AutomationStudioChangeVerdict,
  AutomationStudioChangeVerdictAttempt,
  AutomationStudioChangeVerdictCheck,
  AutomationStudioChangeVerdictEvidenceKind,
  AutomationStudioChangeVerdictInput
} from "./contracts.ts";

export const AUTOMATION_STUDIO_CHANGE_VERDICT_SCHEMA_VERSION = "automation-studio.change-verdict.v1" as const;

/** The evidence kinds, in the order a verdict's `basis` lists them. */
export const AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS: readonly AutomationStudioChangeVerdictEvidenceKind[] = Object.freeze([
  "expected_state",
  "expected_route",
  "expected_outputs",
  "records",
  "downstream_assertion"
]);

/** The route the executor follows when a succeeded attempt names none. */
const DEFAULT_SUCCESS_ROUTE = "success";

export function decideAutomationStudioChangeVerdict(input: AutomationStudioChangeVerdictInput): AutomationStudioChangeVerdict {
  const changed = new Set(input.changedNodeIds);
  const attempts = input.attempts;
  const firstChangedIndex = attempts.findIndex((attempt) => changed.has(attempt.nodeId));
  if (firstChangedIndex < 0) {
    const code = input.notExecutedCode ?? (changed.size === 0 ? "no_changed_nodes" : attempts.length ? "changed_nodes_not_reached" : "trial_not_run");
    return verdict("not_executed", [], [], `The trial did not run a changed node (${code}).`);
  }

  const checks: AutomationStudioChangeVerdictCheck[] = [];
  for (const nodeId of reachedChangedNodeIds(attempts, changed)) {
    const nodeAttempts = attempts.filter((attempt) => attempt.nodeId === nodeId);
    const succeeded = nodeAttempts.filter((attempt) => attempt.status === "succeeded");
    checks.push(changedNodeCheck(nodeId, nodeAttempts));
    for (const check of [
      expectedStateCheck(nodeId, nodeAttempts),
      expectedRouteCheck(nodeId, succeeded, input.failureRoute),
      expectedOutputsCheck(nodeId, succeeded),
      recordsCheck(nodeId, succeeded)
    ]) {
      if (check) checks.push(check);
    }
  }
  checks.push(...downstreamAssertionChecks(attempts, firstChangedIndex));
  const continuation = continuationCheck(input, changed);
  checks.push(continuation.check);

  const failedKinds = unique(checks.filter((check) => check.status === "failed").map((check) => check.kind));
  if (failedKinds.length) {
    return verdict("contradicted", [], checks, `The trial contradicted the change: ${failedKinds.join(", ")} failed.`);
  }
  const changedNodesSucceeded = checks
    .filter((check) => check.kind === "changed_node_succeeded")
    .every((check) => check.status === "passed");
  const basis = AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS.filter((kind) => checks.some((check) => check.kind === kind && check.status === "passed"));
  if (!changedNodesSucceeded) {
    return verdict("unverifiable", [], checks, "A changed node did not finish in the trial, so the change is neither proved nor contradicted.");
  }
  if (!basis.length) {
    return verdict("unverifiable", [], checks, "The changed nodes succeeded, but nothing they declared or a later verification observed proves the change.");
  }
  return verdict("verified", basis, checks, `The trial verified the change by ${basis.join(", ")}.`, continuation.resumeFrom);
}

/**
 * The validation result a verdict earns, or none. Only `verified` (with a
 * basis) records a success and only `contradicted` records a failure: a trial
 * that proved nothing, or never ran, records nothing at all.
 */
export function automationStudioChangeValidationResult(input: {
  verdict: AutomationStudioChangeVerdict;
  runId: string;
  checkedAt: number;
  kind: AutomationStudioFlowChangeValidationKind;
}): AutomationStudioFlowAdaptationValidationResult | undefined {
  const { verdict: decided, runId, checkedAt, kind } = input;
  if (decided.outcome === "verified" && decided.basis.length) {
    return { runId, status: "succeeded", checkedAt, kind, basis: [...decided.basis], detail: decided.reason };
  }
  if (decided.outcome === "contradicted") return { runId, status: "failed", checkedAt, kind, detail: decided.reason };
  return undefined;
}

function verdict(
  outcome: AutomationStudioChangeVerdict["outcome"],
  basis: AutomationStudioChangeVerdictEvidenceKind[],
  checks: AutomationStudioChangeVerdictCheck[],
  reason: string,
  resumeFrom?: AutomationStudioChangeResumePoint
): AutomationStudioChangeVerdict {
  return {
    schemaVersion: AUTOMATION_STUDIO_CHANGE_VERDICT_SCHEMA_VERSION,
    outcome,
    basis,
    checks,
    ...(resumeFrom ? { resumeFrom } : {}),
    reason
  };
}

function reachedChangedNodeIds(attempts: readonly AutomationStudioChangeVerdictAttempt[], changed: ReadonlySet<string>): string[] {
  return unique(attempts.filter((attempt) => changed.has(attempt.nodeId)).map((attempt) => attempt.nodeId));
}

// A cancelled or unfinished attempt says nothing about the change, so it is
// `unknown`, not a failure.
function changedNodeCheck(nodeId: string, nodeAttempts: readonly AutomationStudioChangeVerdictAttempt[]): AutomationStudioChangeVerdictCheck {
  if (nodeAttempts.some((attempt) => attempt.status === "failed")) return check("changed_node_succeeded", "failed", nodeId, "changed_node_failed");
  if (nodeAttempts.some((attempt) => attempt.status !== "succeeded")) return check("changed_node_succeeded", "unknown", nodeId, "changed_node_incomplete");
  return check("changed_node_succeeded", "passed", nodeId);
}

function expectedStateCheck(nodeId: string, nodeAttempts: readonly AutomationStudioChangeVerdictAttempt[]): AutomationStudioChangeVerdictCheck | undefined {
  const evaluations = nodeAttempts.flatMap((attempt) => attempt.expectedState === undefined ? [] : [attempt.expectedState]);
  if (!evaluations.length) return undefined;
  if (evaluations.includes("failed")) return check("expected_state", "failed", nodeId, "expected_state_rejected");
  if (evaluations.some((evaluation) => evaluation !== "passed")) return check("expected_state", "unknown", nodeId, "expected_state_unevaluated");
  return check("expected_state", "passed", nodeId);
}

function expectedRouteCheck(nodeId: string, succeeded: readonly AutomationStudioChangeVerdictAttempt[], failureRoute: string | undefined): AutomationStudioChangeVerdictCheck | undefined {
  const declared = succeeded.filter((attempt) => typeof attempt.expectedRoute === "string" && attempt.expectedRoute.trim() !== "");
  if (!declared.length) return undefined;
  const evidence = declared.filter((attempt) => attempt.expectedRoute!.trim() !== failureRoute);
  if (!evidence.length) return check("expected_route", "not_applicable", nodeId, "expected_route_repeats_failure");
  if (evidence.some((attempt) => (attempt.route ?? DEFAULT_SUCCESS_ROUTE) !== attempt.expectedRoute!.trim())) {
    return check("expected_route", "failed", nodeId, "expected_route_not_taken");
  }
  return check("expected_route", "passed", nodeId);
}

function expectedOutputsCheck(nodeId: string, succeeded: readonly AutomationStudioChangeVerdictAttempt[]): AutomationStudioChangeVerdictCheck | undefined {
  const declared = succeeded.filter((attempt) => attempt.expectedOutputIds?.length);
  if (!declared.length) return undefined;
  const missing = declared.some((attempt) => attempt.expectedOutputIds!.some((outputId) => !(attempt.outputIds ?? []).includes(outputId)));
  return missing ? check("expected_outputs", "failed", nodeId, "expected_outputs_missing") : check("expected_outputs", "passed", nodeId);
}

// Each attempt is held to its own minimum, since a node that saves records
// declares what one extraction must capture. Rows captured by no attempt prove
// nothing, even when the node allows none.
function recordsCheck(nodeId: string, succeeded: readonly AutomationStudioChangeVerdictAttempt[]): AutomationStudioChangeVerdictCheck | undefined {
  const saving = succeeded.flatMap((attempt) => attempt.records ? [attempt.records] : []);
  if (!saving.length) return undefined;
  if (saving.some((records) => !isCount(records.captured) || (records.minimum !== undefined && !isCount(records.minimum)))) {
    return check("records", "unknown", nodeId, "records_count_invalid");
  }
  if (saving.some((records) => records.captured < (records.minimum ?? 0))) return check("records", "failed", nodeId, "records_below_minimum");
  if (saving.every((records) => records.captured === 0)) return check("records", "unknown", nodeId, "records_none_captured");
  return check("records", "passed", nodeId);
}

// A verification node counts only when it ran after the first changed attempt,
// so a changed verification node never vouches for itself, while in a created
// Flow, where every node is changed, a later assertion still counts.
function downstreamAssertionChecks(attempts: readonly AutomationStudioChangeVerdictAttempt[], firstChangedIndex: number): AutomationStudioChangeVerdictCheck[] {
  const later = attempts.slice(firstChangedIndex + 1).filter((attempt) => attempt.verifiesState === true);
  return unique(later.map((attempt) => attempt.nodeId)).map((nodeId) => {
    const nodeAttempts = later.filter((attempt) => attempt.nodeId === nodeId);
    if (nodeAttempts.some((attempt) => attempt.status === "failed")) return check("downstream_assertion", "failed", nodeId, "downstream_assertion_failed");
    if (nodeAttempts.some((attempt) => attempt.status !== "succeeded")) return check("downstream_assertion", "unknown", nodeId, "downstream_assertion_incomplete");
    return check("downstream_assertion", "passed", nodeId);
  });
}

// The next attempt after the last changed one is the target of the route that
// changed node took. With no next attempt, a succeeded run finished, and a run
// that failed on the changed node itself had no edge for its route. A run
// stopped anywhere else (a step budget, a cancel) proves nothing either way.
function continuationCheck(input: AutomationStudioChangeVerdictInput, changed: ReadonlySet<string>): { check: AutomationStudioChangeVerdictCheck; resumeFrom?: AutomationStudioChangeResumePoint } {
  const attempts = input.attempts;
  let lastIndex = -1;
  attempts.forEach((attempt, index) => {
    if (changed.has(attempt.nodeId)) lastIndex = index;
  });
  const last = attempts[lastIndex]!;
  if (last.status !== "succeeded") return { check: check("continuation", "not_applicable", last.nodeId, "changed_node_not_succeeded") };
  const route = last.route ?? DEFAULT_SUCCESS_ROUTE;
  const next = attempts[lastIndex + 1];
  if (next) return { check: check("continuation", "passed", last.nodeId), resumeFrom: { nodeId: next.nodeId, route } };
  if (input.runStatus === "succeeded") return { check: check("continuation", "passed", last.nodeId), resumeFrom: { completed: true } };
  if (input.runStatus === "failed" && input.endNodeId === last.nodeId) return { check: check("continuation", "failed", last.nodeId, "continuation_route_unwired") };
  return { check: check("continuation", "unknown", last.nodeId, "continuation_incomplete") };
}

function check(
  kind: AutomationStudioChangeVerdictCheck["kind"],
  status: AutomationStudioChangeVerdictCheck["status"],
  nodeId: string,
  code?: string
): AutomationStudioChangeVerdictCheck {
  return { kind, status, nodeId, ...(code ? { code } : {}) };
}

function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function unique<T>(values: readonly T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
