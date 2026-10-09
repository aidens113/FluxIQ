// The three questions the verdict cannot answer from an executed attempt's own
// fields: whether the attempt saved records, whether its node is a
// verification step whose success counts as a downstream assertion, and
// whether a later automatic retry of the same node replaced it.
//
// A trial asks them of its throwaway run, and a replay asks them of a later
// ordinary run. Both must answer them the same way or the same change would
// earn a different verdict depending on which run looked at it, so they are
// answered once, here, rather than copied into each caller.
import type { JsonObject } from "../../../../core/index.ts";
import { getAutomationNodeDefinition } from "../../nodes/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor/index.ts";
import { automationStudioDefinitionVerifiesState } from "./contracts.ts";

/**
 * The rows an attempt saved, for a node that saves records: a policy output
 * carrying a record output, or Write Records. Undefined for any other node,
 * which is how the verdict tells "saved nothing" from "does not save at all".
 */
export function automationStudioAttemptCapturedRecords(attempt: Pick<AutomationStudioNodeAttemptTrace, "effects" | "outputs">): { captured: number } | undefined {
  const saves = attempt.effects.some((effect) => effect.type === "records.write" || (effect.type === "policy.output.dispatch" && declaresRecordOutput(effect.payload)));
  if (!saves) return undefined;
  const rows = attempt.outputs.records;
  return { captured: Array.isArray(rows) ? rows.length : savedRecordCount(rows) };
}

/**
 * The count a saved trace keeps where the rows were: `{ $dataset: { recordCount } }`
 * (`executor/record-summary.ts`). A replay is judged from a run's saved trace,
 * so reading only a live array counted every saved extraction as nothing and
 * no extraction Flow's replay could prove its change (t176). Anything else is
 * nothing captured.
 */
function savedRecordCount(rows: unknown): number {
  const marker = isJsonObject(rows) ? rows.$dataset : undefined;
  const count = isJsonObject(marker) ? marker.recordCount : undefined;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

/**
 * True when the attempt's node definition declares `metadata.verifiesState`.
 * A definition Core cannot see into, such as a policy action dispatching a
 * domain's assertion, declares nothing here and is asked of the caller instead.
 */
export function automationStudioAttemptVerifiesState(attempt: Pick<AutomationStudioNodeAttemptTrace, "definitionId">): boolean {
  const definition = getAutomationNodeDefinition(attempt.definitionId);
  const metadata: unknown = definition && "metadata" in definition ? definition.metadata : undefined;
  return isJsonObject(metadata) && automationStudioDefinitionVerifiesState(metadata);
}

/**
 * The ids of the attempts an automatic retry replaced: each id that a later
 * attempt of the same node names as its `retry.previousAttemptId`. Attempts are
 * supplied in execution order.
 *
 * Every node gets a first attempt and up to three retries, and the executor
 * pushes each retry as an attempt of its own, leaving the one it replaces
 * `failed` (`executor/graph-run.ts`). A node that failed once and passed on its
 * retry did what it was for, so the verdict reads the retry, not the failure
 * it replaced. An id named by an attempt of another node, or by no earlier
 * attempt, is not a retry of anything and is left out. A failed attempt with no
 * retry after it is never in the set, so it still counts as the failure it is.
 */
export function automationStudioRetriedAttemptIds(attempts: readonly Pick<AutomationStudioNodeAttemptTrace, "attemptId" | "nodeId" | "retry">[]): ReadonlySet<string> {
  const nodeOf = new Map<string, string>();
  const retried = new Set<string>();
  for (const attempt of attempts) {
    const previous = attempt.retry?.previousAttemptId;
    if (previous !== undefined && nodeOf.get(previous) === attempt.nodeId) retried.add(previous);
    nodeOf.set(attempt.attemptId, attempt.nodeId);
  }
  return retried;
}

// Present and not null declares a record output, as the executor reads it.
function declaresRecordOutput(payload: unknown): boolean {
  if (!isJsonObject(payload)) return false;
  const declared = payload.recordOutput;
  return declared !== undefined && declared !== null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
