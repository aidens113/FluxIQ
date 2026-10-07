import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "./contracts.ts";
import type { AutomationStudioRunState } from "./run-state.ts";
import type { AutomationStudioTraceWithholding } from "./trace-withholding.ts";
import { collectNodeInputs } from "./node-inputs.ts";
import { nodeAttemptWithAdaptationIds } from "./attempt-trace.ts";
import { AutomationStudioNodeAttemptExecution, automationStudioNodeAttemptFailure } from "./node-execution/index.ts";

/**
 * Executes one node and returns its attempt, stamped with the saved changes the
 * node carries. Every path below returns through here, so an attempt of an
 * adapted node names its adaptations whether it succeeded or failed, and
 * however it failed.
 *
 * **It never rejects.** Whatever the node was -- a built-in, a domain output
 * behind an effect dispatcher, a host-executed one, a composite Flow -- and
 * whatever threw, from the dispatch itself or from capturing host state around
 * it, the throw comes back as a classified failed attempt and the run goes on to
 * decide what to do about it. That is what makes this the one seam: the default
 * defensive policy cannot be bypassed by a dispatch path that throws instead of
 * returning, and a path added tomorrow is covered by having been added inside
 * here.
 *
 * It was bypassable. `nativeNodeExecutor` and `compositeExecutor` were both
 * awaited outside the inner `try`, so a host-executed node or a Call Flow child
 * that threw rejected the whole graph run -- no attempt, no trace, no retry, no
 * recovery ladder, nothing for a person to read. The inner catch stays because it
 * can enrich the attempt with the host state captured before the action; this one
 * is the guarantee.
 */
export async function executeAutomationStudioNode(
  flow: AutomationStudioFlowDocument,
  node: AutomationStudioFlowNode,
  values: Record<string, JsonValue>,
  options: AutomationStudioGraphExecutionOptions,
  attemptNumber: number,
  withholding: AutomationStudioTraceWithholding,
  runState: AutomationStudioRunState
): Promise<AutomationStudioNodeAttemptTrace> {
  try {
    const attempt = await AutomationStudioNodeAttemptExecution.execute(flow, node, values, options, attemptNumber, withholding, runState);
    return nodeAttemptWithAdaptationIds(node, attempt);
  } catch (error) {
    const startedAt = options.now?.() ?? Date.now();
    return nodeAttemptWithAdaptationIds(node, automationStudioNodeAttemptFailure(node, error, options, attemptNumber, startedAt, collectNodeInputs(flow, node, values)));
  }
}
