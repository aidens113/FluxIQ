// What a gate that checks a step before it acts is told about the step's list row
// (`options.runControl`, asked once per step in `../graph-run.ts`).
//
// **The same re-find as a stale target's** (`./step-reacquire.ts`, t786): the step that read
// the list is re-run, read-only and internally, the page going back to where it ran if it
// moved; the host says which of the fresh rows is this one, by what it is and never by where
// it was or which handle it had; and the fresh row is the pass's row for the rest of the pass.
// The one difference is when: this is asked before a press, with nothing failed yet, so the
// rule "a source that could act is not re-run" stands exactly as it does there, and a read
// that fails or a host that cannot tell is an answer here, not a retry on the binding it had.
//
// **A pass that already left the list is not sent back to it.** In `open the row's page, then
// press` the first step used the row to go there, and the press belongs on that page: going
// back to re-read the list would take the page away from the press. So once an earlier step
// of this pass may have moved the page (anything but a read or a wait), the row is what the
// run holds, and the gate asks the page only about the control for that row.
//
// **A row whose act the run already completed is left alone:** the arrival skips it as done
// (`../step-loop/already-done.ts`), and a press that removed its own row must not read as gone.

import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../components/automation/control-flow/index.ts";
import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioRunCheckpointRow } from "../../../runtime/automation-host/index.ts";
import { collectWiredNodeInputs } from "../graph-navigation/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../index.ts";
import { automationStudioCompletedActIdentity } from "../lifecycle-run/index.ts";
import { automationStudioRefreshInputs } from "../parameter-refresh/index.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";
import { automationStudioRowLoopOf, automationStudioTargetLineage } from "./lineage.ts";
import { automationStudioReacquireFromSource } from "./step-reacquire.ts";

const POLICY_ACTION = "builtin.policy.action";

/** What the host is told about why it is asked: nothing failed, and nothing has acted. */
const NOTHING_FAILED: NonNullable<AutomationStudioNodeAttemptTrace["failure"]> = { category: "target_not_found", code: "executor.target.row_recheck", retryable: true, stage: "target_resolution", effect: "unacted" };

/** Where `node`'s list row stands now, for a gate about to let it act. Never rejects: what could not be looked at is `unavailable`. */
export async function automationStudioCheckpointRow(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode): Promise<AutomationStudioRunCheckpointRow> {
  try {
    const loopNodeId = automationStudioRowLoopOf(ctx.flow, node);
    if (!loopNodeId) return { outcome: "no_row" };
    if (actCompleted(ctx, node)) return { outcome: "done" };
    const lineage = automationStudioTargetLineage(ctx.flow, node);
    // The list came from outside this graph, so nothing here can read it again.
    if (lineage?.kind !== "row") return { outcome: "unavailable", reason: "no_source" };
    if (!passLeftTheList(ctx, node, loopNodeId)) {
      const found = await automationStudioReacquireFromSource(ctx, node, lineage, NOTHING_FAILED);
      if (found.outcome === "gone") return { outcome: "gone" };
      if (found.outcome === "unmatched") return { outcome: "unmatched", reason: reasonOf(found) };
      if (found.outcome !== "found") return { outcome: "unavailable", reason: reasonOf(found) };
    }
    const resolved = automationStudioRefreshInputs(ctx.flow, node, ctx.values, ctx.options, ctx.runState.variables);
    if (resolved.missingPaths.length) return { outcome: "unavailable", reason: "unresolved_binding" };
    const inputs: Record<string, JsonValue> = { ...(ctx.options.inputs ?? {}), ...collectWiredNodeInputs(ctx.flow, node, ctx.values) };
    return { outcome: "found", parameters: resolved.values, inputs };
  } catch {
    return { outcome: "unavailable", reason: "failed" };
  }
}

function reasonOf(record: object): string {
  const { reason } = record as { reason?: unknown };
  return typeof reason === "string" ? reason : "none";
}

/** Whether the run's completed-act ledger holds this row's act, read as the arrival reads it. */
function actCompleted(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode): boolean {
  const invocation = ctx.options.invocation;
  if (!invocation || invocation.frame.cursor.phase === "handler") return false;
  return invocation.run.lifecycle.completedActs.has(automationStudioCompletedActIdentity({
    flow: ctx.flow, node, attempts: ctx.attempts, values: ctx.values, variables: ctx.runState.variables, runInputs: ctx.options.inputs ?? {}, frameInputs: invocation.frame.inputs
  }));
}

/** Whether a step of this pass before `node` may have moved the page: walked back to the pass's For Each. */
function passLeftTheList(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, loopNodeId: string): boolean {
  for (let index = ctx.attempts.length - 1; index >= 0; index -= 1) {
    const { nodeId } = ctx.attempts[index]!;
    if (nodeId === loopNodeId) return false;
    if (nodeId !== node.id && mayMoveThePage(ctx, nodeId)) return true;
  }
  return false;
}

/** Core's own control and wait nodes touch no page, and a domain's read or wait says so; anything else may move it. */
function mayMoveThePage(ctx: AutomationStudioStepLoopContext, nodeId: string): boolean {
  const other = ctx.nodesById.get(nodeId);
  if (!other) return true;
  if (other.definitionId.startsWith("builtin.")) return other.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID || other.definitionId === POLICY_ACTION;
  return (ctx.runState.actionEffects.get(nodeId) ?? ctx.options.resolveActionEffect?.(other))?.effectClass !== "observe";
}
