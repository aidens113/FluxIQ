// The re-find itself (t786, design D2-D6): the source re-run, the host's match and the
// rebinding. What asks for it is `./step-reacquire.ts`, after a retry lost its target, and
// `./row-recheck.ts`, before a press.

import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioTargetLineage, AutomationStudioTargetReacquireRecord } from "../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../index.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";
import { automationStudioReacquireBoundValue } from "./bound-value.ts";
import { automationStudioReacquireCandidates } from "./candidates.ts";
import { automationStudioReacquireHostAnswer } from "./host-answer.ts";
import { automationStudioReacquireSourceReadOnly } from "./read-only-source.ts";
import { automationStudioReacquireSourcePlace } from "./source-place.ts";
import { automationStudioReacquireSourceRerun } from "./source-rerun.ts";

/** The re-run, the match and the rebinding; every way it can stop short is an `unavailable` or `unmatched` record. */
export async function automationStudioReacquireFromSource(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  lineage: AutomationStudioTargetLineage,
  failure: NonNullable<AutomationStudioNodeAttemptTrace["failure"]>
): Promise<AutomationStudioTargetReacquireRecord> {
  const { options, values } = ctx;
  const ended = (outcome: AutomationStudioTargetReacquireRecord["outcome"], reason?: string, returned?: boolean): AutomationStudioTargetReacquireRecord => ({
    sourceNodeId: lineage.sourceNodeId, kind: lineage.kind, outcome, ...(reason ? { reason } : {}), ...(returned ? { returned: true as const } : {}), at: ctx.now()
  });
  const source = ctx.nodesById.get(lineage.sourceNodeId);
  const host = options.hostRuntime;
  if (!source || !automationStudioReacquireSourceReadOnly(source, ctx.runState.actionEffects.get(source.id) ?? options.resolveActionEffect?.(source))) return ended("unavailable", "source_not_read_only");
  if (!host?.reacquireTarget) return ended("unavailable", "no_matcher");
  const bound = automationStudioReacquireBoundValue(ctx.flow, node, lineage, values);
  if (!bound) return ended("unavailable", "no_stale_value");
  const place = await automationStudioReacquireSourcePlace({ host, node, source, attempts: ctx.attempts, signal: options.signal });
  const returned = place === "returned";
  if (place === "unavailable") return ended("unavailable", "place_unreachable");
  const outputs = await automationStudioReacquireSourceRerun(ctx, source);
  if (!outputs) return ended("unavailable", "source_failed", returned);
  const candidates = automationStudioReacquireCandidates(lineage, outputs, bound.field);
  if (!candidates) return ended("unavailable", "no_candidates", returned);
  const answer = await automationStudioReacquireHostAnswer(host, {
    node, source, lineage, stale: bound.stale, candidates, failure, ...(options.signal ? { signal: options.signal } : {})
  });
  if (answer.outcome === "unmatched") return ended("unmatched", answer.reason, returned);
  if (answer.outcome === "gone") return ended("gone", undefined, returned);
  if (lineage.kind === "row") {
    // The fresh row is the pass's row for the rest of the pass, and a row the run captured keeps its marker in the saved trace.
    const marker = ctx.runState.records.captured().get(bound.stale as object);
    if (marker && answer.value && typeof answer.value === "object") ctx.runState.records.include(new Map([[answer.value, marker]]));
    if (lineage.loopNodeId) values[`${lineage.loopNodeId}.item`] = answer.value;
    values.item = answer.value;
  } else if (bound.path) {
    ctx.arrival.overlay = { [bound.path]: answer.value };
  }
  return ended("found", undefined, returned);
}
