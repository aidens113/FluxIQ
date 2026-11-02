import type { ExecutionOriginRecord } from "../contracts/index.ts";
import { executionRecord } from "./record.ts";
import { executionText } from "./text.ts";

export function executionOrigin(value: unknown, sourceKey: string): ExecutionOriginRecord {
  const row = executionRecord(value, ["sourceKey", "operationKey", "runId", "invocationId", "attemptId", "bindingDigest"], ["sourceKey", "operationKey"], "origin");
  if (row.sourceKey !== sourceKey) throw new Error("execution_admission.origin_source_mismatch");
  return Object.freeze({
    sourceKey,
    operationKey: executionText(row.operationKey, "operation"),
    ...(row.runId === undefined ? {} : { runId: executionText(row.runId, "run") }),
    ...(row.invocationId === undefined ? {} : { invocationId: executionText(row.invocationId, "invocation") }),
    ...(row.attemptId === undefined ? {} : { attemptId: executionText(row.attemptId, "attempt") }),
    ...(row.bindingDigest === undefined ? {} : { bindingDigest: executionText(row.bindingDigest, "binding_digest") })
  });
}
