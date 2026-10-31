import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";
import type { AutomationStudioTargetRefreshResolution } from "../parameter-refresh/index.ts";
import type { AutomationStudioParameterRefreshOverlay } from "../parameter-refresh/index.ts";
import { automationStudioRefreshInputs } from "../parameter-refresh/index.ts";
import { automationStudioRefreshScope } from "../parameter-refresh/index.ts";
import { automationStudioRefreshSnapshot } from "../parameter-refresh/index.ts";
import { automationStudioRefreshPatches } from "../parameter-refresh/index.ts";
import { automationStudioRefreshFloor } from "../parameter-refresh/index.ts";
import { automationStudioApplyParameterRefresh } from "../parameter-refresh/index.ts";
import type { AutomationStudioUnboundTargetReacquireRequest } from "./request.ts";
import type { AutomationStudioIdentityReacquireRecord } from "./identity-record.ts";
import { automationStudioUnboundReacquireAnswer } from "./host-answer.ts";

/** The source-less branch only; the caller owns common retry/act gates and cancellation. */
export async function automationStudioUnboundReacquire(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, retried: AutomationStudioNodeAttemptTrace): Promise<AutomationStudioIdentityReacquireRecord> {
  const ended = (outcome: AutomationStudioIdentityReacquireRecord["outcome"], reason?: AutomationStudioIdentityReacquireRecord["reason"]): AutomationStudioIdentityReacquireRecord => ({ kind: "identity", outcome, ...(reason ? { reason } : {}), at: ctx.now() });
  const prepared = prepare(ctx, node);
  if (prepared.kind !== "prepared") return ended("unavailable", prepared.reason);
  const { resolved } = prepared;
  if (resolved.missingPaths.length) return ended("unavailable", "unresolved_parameters");
  if (!ctx.options.resolveTargetRefresh) return ended("unavailable", "no_refresh_declaration");
  let scope: AutomationStudioTargetRefreshResolution;
  try {
    scope = automationStudioRefreshScope(ctx.options.resolveTargetRefresh(node, resolved.values));
  } catch {
    scope = { kind: "unreadable", reason: "registry_unreadable" };
  }
  if (scope.kind !== "declared") return ended("unavailable", scope.kind === "absent" ? "no_refresh_declaration" : scope.kind === "unreadable" ? "scope_unreadable" : "scope_rejected");
  const beforeAction = retried.stateRefs?.beforeAction;
  const payload = automationStudioRefreshSnapshot({ node, parameters: resolved.values, refresh: scope.refresh, previousAttempt: { attemptId: retried.attemptId, ...(beforeAction ? { beforeAction: { stateSnapshotId: beforeAction.stateSnapshotId, stateRef: beforeAction.stateRef, capturedAt: beforeAction.capturedAt } } : {}) }, failure: retried.failure! });
  if (payload.kind !== "copied") return ended("unavailable", "parameters_unreadable");
  const snapshot = payload.value as unknown as AutomationStudioUnboundTargetReacquireRequest;
  const overlay: AutomationStudioParameterRefreshOverlay = { nodeId: node.id, definitionId: node.definitionId, ...(node.definitionVersion ? { definitionVersion: node.definitionVersion } : {}), refresh: scope.refresh, baseline: snapshot.parameters, patches: [], active: false };
  const prior = automationStudioRefreshFloor(node, snapshot.parameters, snapshot.parameters, ctx.options, ctx.runState.actionEffects.get(node.id));
  if (prior.kind !== "accepted") {
    if (prior.kind === "unreadable") {
      overlay.effectFailure = true;
      ctx.arrival.parameterOverlay = overlay;
    }
    return ended("unavailable", prior.reason);
  }
  if (ctx.options.signal?.aborted) return ended("unavailable", "aborted");
  const request = Object.freeze({ ...snapshot, ...(ctx.options.signal ? { signal: ctx.options.signal } : {}) });
  const answer = await automationStudioUnboundReacquireAnswer(ctx.options.hostRuntime!, request);
  if (ctx.options.signal?.aborted) return ended("unavailable", "aborted");
  if (answer.outcome !== "found") return ended(answer.outcome, "reason" in answer ? answer.reason : undefined);
  const patched = automationStudioRefreshPatches(scope.refresh, snapshot.parameters, answer.patches);
  if (patched.kind !== "applied") return ended("unmatched", "invalid_patch");
  const floor = automationStudioRefreshFloor(node, snapshot.parameters, patched.parameters, ctx.options, prior.floor);
  if (floor.kind !== "accepted") {
    if (floor.kind === "unreadable") {
      overlay.effectFailure = true;
      overlay.floor = prior.floor;
      ctx.arrival.parameterOverlay = overlay;
    }
    return ended(floor.kind === "unreadable" ? "unavailable" : "unmatched", floor.reason);
  }
  overlay.active = true;
  overlay.patches = patched.patches;
  overlay.floor = floor.floor;
  const current = prepare(ctx, node);
  if (current.kind !== "prepared") return ended("unavailable", current.reason);
  if (current.resolved.missingPaths.length) return ended("unavailable", "unresolved_parameters");
  const checked = automationStudioApplyParameterRefresh(node, current.resolved.values, overlay);
  if (checked.kind !== "applied") return ended(checked.kind === "unreadable" ? "unavailable" : "unmatched", checked.reason);
  ctx.arrival.parameterOverlay = overlay;
  return ended("found");
}

function prepare(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode) {
  try {
    return { kind: "prepared" as const, resolved: automationStudioRefreshInputs(ctx.flow, node, ctx.arrival.overlay ? { ...ctx.values, ...ctx.arrival.overlay } : ctx.values, ctx.options, ctx.runState.variables) };
  } catch {
    return { kind: "unreadable" as const, reason: "parameters_unreadable" as const };
  }
}
