import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../contracts.ts";

/**
 * What a seam of the step loop tells the loop to do next, which the loop
 * applies (`graph-run.ts`):
 *
 * - `return`: the run ends with `trace`;
 * - `next`: the run moves to `node`, its region transition already recorded;
 * - `retry`: the run attempts the same node again, its wait already taken;
 * - `proceed`: the loop goes on with this step, leaving the node by
 *   `routeOverride` when one is set and by the attempt's own route otherwise.
 */
export type AutomationStudioStepOutcome =
  | { kind: "return"; trace: AutomationStudioGraphExecutionTrace }
  | { kind: "next"; node: AutomationStudioFlowNode }
  | { kind: "retry" }
  | { kind: "proceed"; routeOverride?: string };
