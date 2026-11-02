import type { VerifiedExecutionEvidence } from "../contracts/index.ts";
import { executionRecord } from "./record.ts";
import { executionText } from "./text.ts";

export function executionEvidence(value: unknown): VerifiedExecutionEvidence {
  if (value === null || typeof value !== "object") throw new Error("execution_admission.invalid_evidence");
  const kind = Object.getOwnPropertyDescriptor(value, "kind")?.value as unknown;
  if (kind === "interrupted") {
    const row = executionRecord(value, ["kind", "reason"], ["kind", "reason"], "evidence");
    if (row.reason !== "aborted" && row.reason !== "timed_out" && row.reason !== "callback_threw" && row.reason !== "observer_failed") throw new Error("execution_admission.invalid_interruption");
    return Object.freeze({ kind, reason: row.reason });
  }
  if (kind === "command_delivery") {
    const keys = ["kind", "commandId", "claimDigest", "receiptDigest"];
    const row = executionRecord(value, keys, keys, "evidence");
    return Object.freeze({ kind, commandId: executionText(row.commandId, "command"), claimDigest: executionText(row.claimDigest, "claim_digest"), receiptDigest: executionText(row.receiptDigest, "receipt_digest") });
  }
  if (kind === "required_consumed") {
    const keys = ["kind", "commandId", "handlingDigest"];
    const row = executionRecord(value, keys, keys, "evidence");
    return Object.freeze({ kind, commandId: executionText(row.commandId, "command"), handlingDigest: executionText(row.handlingDigest, "handling_digest") });
  }
  if (kind === "returned_unverified") {
    const row = executionRecord(value, ["kind", "completionDigest"], ["kind", "completionDigest"], "evidence");
    return Object.freeze({ kind, completionDigest: executionText(row.completionDigest, "completion_digest") });
  }
  if (kind === "terminal_unknown" || kind === "required_latched") {
    const row = executionRecord(value, ["kind", "code"], ["kind", "code"], "evidence");
    return Object.freeze({ kind, code: executionText(row.code, "code") });
  }
  if (kind === "coverage_complete") {
    const keys = ["kind", "disposition", "completionDigest", "assessmentDigest"];
    const row = executionRecord(value, keys, keys, "evidence");
    if (row.disposition !== "unacted" && row.disposition !== "settled") throw new Error("execution_admission.invalid_disposition");
    return Object.freeze({ kind, disposition: row.disposition, completionDigest: executionText(row.completionDigest, "completion_digest"), assessmentDigest: executionText(row.assessmentDigest, "assessment_digest") });
  }
  throw new Error("execution_admission.invalid_evidence");
}
