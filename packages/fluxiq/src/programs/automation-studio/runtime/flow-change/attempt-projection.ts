// The two questions the verdict cannot answer from an executed attempt's own
// fields: whether the attempt saved records, and whether its node is a
// verification step whose success counts as a downstream assertion.
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
  return { captured: Array.isArray(rows) ? rows.length : 0 };
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

// Present and not null declares a record output, as the executor reads it.
function declaresRecordOutput(payload: unknown): boolean {
  if (!isJsonObject(payload)) return false;
  const declared = payload.recordOutput;
  return declared !== undefined && declared !== null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
