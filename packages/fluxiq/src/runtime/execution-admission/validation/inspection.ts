import type { ExecutionInspection } from "../contracts/index.ts";
import { executionRecord } from "./record.ts";
import { executionText } from "./text.ts";

export function executionInspection(value: unknown): ExecutionInspection {
  const keys = ["state", "generation", "blockers"];
  const row = executionRecord(value, keys, keys, "inspection");
  if (row.state !== "clear" && row.state !== "pending" && row.state !== "required_latched" && row.state !== "unverified") throw new Error("execution_admission.invalid_inspection");
  if (!Array.isArray(row.blockers) || row.blockers.length > 256) throw new Error("execution_admission.invalid_blockers");
  const blockers = row.blockers.map(value => {
    const blocker = executionRecord(value, ["entryId", "code"], ["entryId", "code"], "blocker");
    return Object.freeze({ entryId: executionText(blocker.entryId, "entry"), code: executionText(blocker.code, "code") });
  });
  if (row.state === "clear" && blockers.length) throw new Error("execution_admission.invalid_inspection");
  return Object.freeze({ state: row.state, generation: executionText(row.generation, "generation"), blockers: Object.freeze(blockers) });
}
