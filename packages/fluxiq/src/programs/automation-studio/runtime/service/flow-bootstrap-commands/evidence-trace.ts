import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowBootstrapEvidenceSteps, type AutomationStudioFlowBootstrapEvidenceTraceRow } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmBuildCallRecord, type AutomationStudioLlmRunCallRecord } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { requiredBootstrapCommandId } from "./field-readings.ts";

// The evidence loop trace an audit event records: validated first, then
// counted, so a malformed trace never reaches a reader as accounting.
//
// What the trace keeps is also what a *proposed* build can ever say about
// itself. The adaptation stores the sanitized trace and the created audit
// event carries the detail built from it, and both used to drop the two
// members that make a decision legible -- the code it came to, and whether its
// effect was applied. So the build anybody actually wants to study was stored
// as a list of iterations naming a tool each, with no way to tell a call that
// changed the page from one that only looked, or a refusal from a success,
// while only a refused build kept them through a different path. Both are kept
// now, and the detail carries the same ordered steps the refusal path
// publishes.
//
// Two further things the trace had all along and nobody could read. The rows
// it keeps carry `iteration`, `callId`, `evidenceBytes` and the provider's
// `usage`, and the published steps threw all four away -- so a failed build's
// 32 decisions arrived as a tool id and a code each, twenty of them the same
// code, with nothing to order them by and no tokens against any of them. Three
// of the four now travel; the call id stays in this stored trace and is not
// published as a step, because the model writes it and a published step carries
// codes and identifiers only (`flow-bootstrap/evidence-loop-steps.ts`). And a
// build's provider calls were never itemized at all: a build holds no budget
// lease, so the per-call ledger a run gets never saw them, and a reader
// downstream published an empty list beside a total it could not break down.
// `providerCalls` below is that ledger, read back from the rows the loop had
// already written.

/** The shape a result code must have to be kept: no whitespace, so no sentence. */
const EVIDENCE_RESULT_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/**
 * The most rows one trace may carry: two per decision, plus the deterministic
 * iteration-0 observation.
 *
 * It was one per decision, which is not what the loop writes. An `amend_draft`
 * decision that carries a `rerun` pushes its own row and then the row for the
 * call the rerun makes, both under one iteration, so a build that corrected a
 * step on many of its decisions could write more rows than there were
 * iterations -- and this bound would then have thrown away the whole record of
 * a build that had completed. Two is the loop's real ceiling: no path writes a
 * third row for one iteration (`runtime/llm/evidence-loop.ts`).
 */
const MAX_TRACE_ROWS = AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * 2 + 1;

export function sanitizeEvidenceLoopTrace(
  trace: readonly AutomationStudioFlowBootstrapEvidenceTraceRow[]
): AutomationStudioFlowBootstrapEvidenceTraceRow[] {
  if (!Array.isArray(trace) || trace.length > MAX_TRACE_ROWS) throw new Error("Flow Bootstrap evidence trace is invalid.");
  return trace.map((item) => {
    if (!Number.isInteger(item.iteration) || item.iteration < 0 || item.iteration > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations || !["tool_call", "complete", "unusable", "amend_draft"].includes(item.decision)) throw new Error("Flow Bootstrap evidence trace is invalid.");
    const clean: AutomationStudioFlowBootstrapEvidenceTraceRow = { iteration: item.iteration, decision: item.decision };
    if (item.callId !== undefined) clean.callId = requiredBootstrapCommandId(item.callId, "evidence call");
    if (item.toolId !== undefined) clean.toolId = requiredBootstrapCommandId(item.toolId, "evidence tool");
    if (item.evidenceBytes !== undefined) {
      if (!Number.isSafeInteger(item.evidenceBytes) || item.evidenceBytes < 0 || item.evidenceBytes > 1_048_576) throw new Error("Flow Bootstrap evidence byte count is invalid.");
      clean.evidenceBytes = item.evidenceBytes;
    }
    if (item.effectApplied !== undefined) {
      if (typeof item.effectApplied !== "boolean") throw new Error("Flow Bootstrap evidence effect flag is invalid.");
      clean.effectApplied = item.effectApplied;
    }
    // Bounded by shape rather than by an allow-list: the codes come from the
    // loop, from a domain's refusal and from validation, and a closed list
    // here would silently drop a new one. A value that is not code-shaped is
    // left behind rather than failing the build, because it is a reader's
    // detail and not the build's result -- two tasks wrote this field at the
    // same time, and the other one threw on a bad code, which would discard
    // the whole record of a build that had completed.
    if (item.resultCode !== undefined && typeof item.resultCode === "string" && EVIDENCE_RESULT_CODE.test(item.resultCode)) clean.resultCode = item.resultCode;
    // The moment the row was recorded, which is what lets a reader locate a
    // stall in time instead of inferring it from one undivided gap. Left
    // behind rather than thrown on, for the same reason as the code above: a
    // build that finished must not be discarded over a reader's detail.
    if (Number.isSafeInteger(item.at) && (item.at as number) >= 0) clean.at = item.at;
    if (item.usage) clean.usage = { ...item.usage };
    return clean;
  });
}
/**
 * `additionalProviderCalls` are the build's provider calls that are not the
 * loop's own -- today, reading the person's instruction for what it asks for.
 * They were invisible here by construction, so every per-build call count a
 * reader published was short by them while their tokens and their money were
 * counted.
 *
 * They are published beside `providerCallCount` rather than inside it, and
 * that is a constraint rather than a preference. A reader holds this record to
 * `decisionCount === providerCallCount` and `iterationCount` within one of it
 * (`packages/test-runner/src/existing-fluxiq-control/adaptation-evidence-loop.ts`
 * in the downstream testing facility), so folding the extra call into
 * `providerCallCount` makes every evidence-guided build fail that contract
 * before its Flow is read -- measured, on `run-mudna2ng-ceadeb69`.
 * `totalProviderCallCount` is the true number a reader should move to; until it
 * does, the two loop counts keep meaning exactly what they meant.
 *
 * **The four counts are three different things and must not be confused.**
 * `providerCallCount` and `decisionCount` are the loop's paid calls, one per
 * iteration. `iterationCount` is those plus the deterministic iteration-0
 * observation where there was one. `traceStepCount` is the rows, which is the
 * only one of the four that a decision editing the draft and re-running a step
 * moves by two.
 */
export function evidenceTraceAuditDetail(trace: readonly AutomationStudioFlowBootstrapEvidenceTraceRow[], additionalProviderCalls = 0): JsonObject {
  const clean = sanitizeEvidenceLoopTrace(trace);
  // **A provider call is an iteration, not a row.** One decision is one paid
  // call, and the loop writes one row for most of them -- but an `amend_draft`
  // carrying a `rerun` writes two, its own and the one for the call the rerun
  // makes, both under the iteration that paid for them. Counting rows
  // therefore charged a build for calls it never made: `run-mudw1ktb-0557816b`
  // made 16 provider calls and was published, and measured, as having made 22,
  // and every per-call figure anyone computed from it -- tokens, money,
  // seconds -- was 27% too low.
  const providerIterations = new Set(clean.flatMap((item) => item.iteration > 0 ? [item.iteration] : []));
  const extra = Number.isSafeInteger(additionalProviderCalls) && additionalProviderCalls > 0 ? additionalProviderCalls : 0;
  return {
    evidenceGuided: true,
    // Every iteration the loop ran, including the deterministic iteration-0
    // observation where it made one -- so this is the loop's decisions plus at
    // most one, which is exactly what its name says and what a reader holds it
    // to. `traceStepCount` beside it is the rows, and the two differ by
    // however many decisions edited the draft and re-ran a step.
    iterationCount: providerIterations.size + (clean.some((item) => item.iteration === 0) ? 1 : 0),
    traceStepCount: clean.length,
    providerCallCount: providerIterations.size,
    decisionCount: providerIterations.size,
    /** The build's provider calls that were not the loop's own. */
    additionalProviderCallCount: extra,
    /** Every provider call the build made. The one figure that is the whole of what it spent. */
    totalProviderCallCount: providerIterations.size + extra,
    toolCallCount: clean.filter((item) => item.decision === "tool_call").length,
    evidenceBytes: clean.reduce((sum, item) => sum + (item.evidenceBytes ?? 0), 0),
    toolIds: [...new Set(clean.flatMap((item) => item.toolId ? [item.toolId] : []))].sort(),
    // Every decision in order, the same fields a refused build's diagnostic
    // carries. `toolIds` above is a sorted set and says nothing about
    // sequence, so it can never show what the build did, only what it used.
    steps: automationStudioFlowBootstrapEvidenceSteps(clean),
    // The loop's calls one at a time, in the record a run's calls are itemized
    // in, so one reader reads both. `sequence` is the iteration that paid for
    // the call, which is what `steps[].iteration` says too, so a line and the
    // decisions it paid for join on it.
    providerCalls: evidenceTraceProviderCalls(clean),
    // Calls counted above that these lines do not itemize: the build's calls
    // outside the loop, which leave no trace row to read back.
    providerCallsOmitted: extra
  };
}

/**
 * One line per provider call the loop made. A decision that edited the draft
 * and re-ran a step wrote two rows under one iteration and cost one call, so
 * the rows are folded by iteration and the call is read from the one carrying
 * the provider's usage.
 */
function evidenceTraceProviderCalls(clean: readonly AutomationStudioFlowBootstrapEvidenceTraceRow[]): AutomationStudioLlmRunCallRecord[] {
  const paid = new Map<number, AutomationStudioFlowBootstrapEvidenceTraceRow>();
  for (const item of clean) {
    if (item.iteration <= 0) continue;
    const held = paid.get(item.iteration);
    if (!held || (!held.usage && item.usage)) paid.set(item.iteration, item);
  }
  return [...paid.entries()]
    .sort(([left], [right]) => left - right)
    .map(([iteration, row]) => automationStudioLlmBuildCallRecord({ sequence: iteration, ...(row.usage ? { usage: row.usage } : {}) }));
}
