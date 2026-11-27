import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "../result-feed/index.ts";

/** An explicit, evidenced amendment of automatic processing, never another blind transformation pass. */
export function automationStudioAnswerFirstAmendProcessing(result: AutomationStudioAnswerFirstResultFeed, value: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
  const raw = value.clear === true ? {} : value.process;
  const amended = raw === undefined ? { ok: false as const, reason: "Give process, the complete declaration, or clear: true with why describing the changed evidence or correction." }
    : result.amendProcessing(raw, typeof value.why === "string" ? value.why : undefined);
  if (!amended.ok) return { kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: "result_processing.invalid", evidence: { ok: false, code: "result_processing.invalid", said: amended.reason } };
  const rows = result.rows();
  const readiness = result.readiness();
  const bound = result.boundProcessing();
  const evidence = result.evidence().processing;
  return {
    kind: "llm_evidence_tool_execution", effectApplied: false,
    resultCode: readiness.state === "missing-evidence" ? readiness.code : "result_processing.set",
    evidence: {
      ok: readiness.state !== "missing-evidence", changed: amended.changed,
      ...(bound === undefined ? {} : { set: JSON.parse(JSON.stringify(bound)) as JsonObject }),
      ...(evidence === undefined ? {} : { read: evidence.collected, leftOut: evidence.leftOut, repeats: evidence.repeats, cut: evidence.cut, kept: evidence.kept, filters: [...evidence.filters] as unknown as JsonObject[] }),
      ...(readiness.state === "missing-evidence" ? { code: readiness.code, said: readiness.reason } : {}),
      // Where the rows hold the request's columns, when the framework placed any under other keys (t1074).
      ...(readiness.state !== "missing-evidence" && result.columnNames() ? { columns: result.columnNames()! } : {}),
      rows: rows.rows.map((row) => Object.fromEntries(rows.columns.filter(({ id }) => Object.hasOwn(row, id)).map(({ id }) => [id, row[id]!]))),
    }
  };
}
