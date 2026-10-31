import { automationStudioLlmRerunFrame, runWithAutomationStudioLlmRerunFrame, type AutomationStudioLlmRerunFrame } from "./context.ts";
import { automationStudioResolvedActionEffectRepeatSafe } from "../../../nodes/action-effect/index.ts";
import { runWithAutomationStudioActionAssessments } from "../../action-permissions/assessment-observation/index.ts";
import { createAutomationStudioLlmRerunAssessment } from "./assessment.ts";
import { automationStudioLlmRerunReadDispatch } from "./dispatch.ts";
import {
  automationStudioLlmRerunJsonSnapshot,
  automationStudioLlmRerunReadSettlement,
  automationStudioLlmRerunReadSnapshot,
  type AutomationStudioLlmRerunFrozenSnapshot
} from "./snapshot.ts";
import type {
  AutomationStudioLlmRerunCaptureAccess,
  AutomationStudioLlmRerunCaptureSnapshot,
  AutomationStudioLlmRerunExecutionAccess,
  AutomationStudioLlmRerunExecutionInput,
  AutomationStudioLlmRerunExecutionRefused,
  AutomationStudioLlmRerunExecutor,
  AutomationStudioLlmRerunLookup,
  AutomationStudioLlmRerunOutcome,
  AutomationStudioLlmRerunProvenance,
  AutomationStudioLlmRerunRecord,
  AutomationStudioLlmRerunRequest,
  AutomationStudioLlmRerunResult,
  AutomationStudioLlmRerunScope,
  AutomationStudioLlmRerunUnavailable,
  AutomationStudioLlmRerunUnavailableReason
} from "./types.ts";

type Entry = {
  record: AutomationStudioLlmRerunRecord;
  scope: AutomationStudioLlmRerunScope;
  captured: AutomationStudioLlmRerunFrozenSnapshot;
  executor: AutomationStudioLlmRerunExecutor;
  revoked?: AutomationStudioLlmRerunUnavailableReason;
};

type CaptureTransaction = {
  active: boolean;
  captured?: AutomationStudioLlmRerunFrozenSnapshot;
  reason?: AutomationStudioLlmRerunUnavailableReason;
};

/**
 * Core-private authority boundary. The SDK exposes only the two adapter readers.
 * This closure never dispatches, grants permission or retries. Its private repeat
 * scopes can only hold an action the shared trusted safety policy cannot prove.
 */
export function createAutomationStudioLlmRerunProvenance(input: Readonly<{
  currentScope(): AutomationStudioLlmRerunScope | undefined;
}>): AutomationStudioLlmRerunProvenance {
  let disposed = false;
  let entries = new WeakMap<AutomationStudioLlmRerunRecord, Entry>();
  const calls = new Map<string, AutomationStudioLlmRerunLookup>();
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  let attempted = new WeakSet<object>();
  let receipted = new WeakSet<object>();

  function current(): AutomationStudioLlmRerunScope | AutomationStudioLlmRerunUnavailable {
    if (disposed) return unavailable("disposed");
    try {
      const value = input.currentScope();
      if (!value) return unavailable("scope_unavailable");
      const fields = Object.getOwnPropertyDescriptors(value);
      const loop = fields.loop?.value as unknown;
      const binding = fields.binding?.value as unknown;
      const generation = fields.generation?.value as unknown;
      const registry = fields.registry?.value as unknown;
      const authority = fields.authority?.value as unknown;
      if (!identity(loop) || !identity(binding) || !identity(generation) || !identity(registry) || !identity(authority)) return unavailable("scope_unavailable");
      return Object.freeze({ loop, binding, generation, registry, authority });
    } catch {
      return unavailable("scope_unreadable");
    }
  }

  function scopeReason(scope: AutomationStudioLlmRerunScope): AutomationStudioLlmRerunUnavailableReason | undefined {
    const now = current();
    if ("kind" in now) return now.reason;
    return sameScope(scope, now) ? undefined : "scope_changed";
  }

  function revoke(entry: Entry, reason: AutomationStudioLlmRerunUnavailableReason): AutomationStudioLlmRerunUnavailable {
    entry.revoked ??= reason;
    const refusal = unavailable(entry.revoked);
    calls.set(entry.record.callId, refusal);
    return refusal;
  }

  function entryReason(entry: Entry): AutomationStudioLlmRerunUnavailableReason | undefined {
    if (entry.revoked) return entry.revoked;
    const reason = scopeReason(entry.scope);
    if (reason) return revoke(entry, reason).reason;
    const stored = calls.get(entry.record.callId);
    if (stored?.kind !== "available" || stored.record !== entry.record) return revoke(entry, "record_missing").reason;
    return undefined;
  }

  function lookup(callId: string): AutomationStudioLlmRerunLookup {
    if (disposed) return unavailable("disposed");
    const found = calls.get(callId);
    if (!found) return unavailable("record_missing");
    if (found.kind === "unavailable") return found;
    const entry = entries.get(found.record);
    if (!entry) return unavailable("foreign_record");
    const reason = entryReason(entry);
    return reason ? unavailable(reason) : found;
  }

  async function capture(request: AutomationStudioLlmRerunRequest, executor: AutomationStudioLlmRerunExecutor): Promise<AutomationStudioLlmRerunResult> {
    const duplicate = seen.has(request.callId);
    if (duplicate) duplicated.add(request.callId);
    seen.add(request.callId);
    const scope = current();
    const original = automationStudioLlmRerunJsonSnapshot(request.value);
    const reason = duplicate ? "duplicate_call" : request.toolId !== "core.run_node" ? "tool_unavailable"
      : "kind" in scope ? scope.reason : original.kind !== "valid" ? original.reason : undefined;
    if (reason || "kind" in scope || original.kind !== "valid") {
      const refusal = unavailable(reason ?? "invalid_snapshot");
      calls.set(request.callId, refusal);
      // Hide an outer transaction even for an ordinary call we cannot prove.
      return runWithAutomationStudioLlmRerunFrame(refusal, () => executor(request));
    }
    const captureScope: AutomationStudioLlmRerunScope = scope;

    const transaction: CaptureTransaction = { active: true };
    const assessment = createAutomationStudioLlmRerunAssessment({
      callId: request.callId, toolId: request.toolId, active: () => transaction.active
    });
    const frame: AutomationStudioLlmRerunFrame = Object.freeze({ kind: "capture", read });
    const sink: AutomationStudioLlmRerunCaptureAccess = Object.freeze({ kind: "capture", publish });

    function captureReason(): AutomationStudioLlmRerunUnavailableReason | undefined {
      if (!transaction.active || automationStudioLlmRerunFrame() !== frame) return "capture_closed";
      return transaction.reason ?? scopeReason(captureScope);
    }

    function read(): AutomationStudioLlmRerunCaptureAccess {
      const unavailableReason = captureReason();
      return unavailableReason ? unavailable(unavailableReason) : sink;
    }

    function publish(snapshot: AutomationStudioLlmRerunCaptureSnapshot): Readonly<{ kind: "accepted" }> | AutomationStudioLlmRerunUnavailable {
      const unavailableReason = captureReason();
      if (unavailableReason) return unavailable(unavailableReason);
      if (transaction.captured) {
        transaction.reason = "capture_conflict";
        return unavailable(transaction.reason);
      }
      const captured = automationStudioLlmRerunReadSnapshot(snapshot);
      if ("kind" in captured) {
        transaction.reason = captured.reason;
        return captured;
      }
      if (request.referenceNow !== undefined && request.referenceNow !== captured.snapshot.referenceNow) {
        transaction.reason = "reference_changed";
        return unavailable(transaction.reason);
      }
      transaction.captured = captured;
      rememberDispatch(captured.snapshot.dispatch);
      return Object.freeze({ kind: "accepted" });
    }

    let result: AutomationStudioLlmRerunResult;
    try {
      result = await runWithAutomationStudioActionAssessments(assessment.scope,
        () => runWithAutomationStudioLlmRerunFrame(frame, () => executor(request)));
    } catch (error) {
      calls.set(request.callId, unavailable("result_unproven"));
      throw error;
    } finally {
      transaction.active = false;
    }
    const finalReason = duplicated.has(request.callId) ? "duplicate_call" : transaction.reason ?? scopeReason(captureScope);
    const captured = transaction.captured;
    const settlement = automationStudioLlmRerunReadSettlement(result);
    if (finalReason || !captured || settlement.kind !== "valid") {
      calls.set(request.callId, unavailable(finalReason ?? (!captured ? "capture_missing" : "result_unproven")));
      return result;
    }
    // The record's fields can be read by Core/C, but spreading/stringifying it
    // cannot publish resolved selectors, port values or the raw execution.
    const observedEffect = assessment.proof();
    const record: AutomationStudioLlmRerunRecord = hidden({}, {
      callId: request.callId,
      toolId: "core.run_node" as const,
      definitionId: captured.snapshot.definitionId,
      definitionVersion: captured.snapshot.definitionVersion,
      parameters: captured.snapshot.parameters,
      effectiveInputs: captured.snapshot.effectiveInputs,
      subject: captured.snapshot.subject,
      referenceNow: captured.snapshot.referenceNow,
      resultCode: settlement.resultCode,
      ...(observedEffect === undefined ? {} : { observedEffect }),
      originalValue: original.value,
      execution: settlement.execution
    });
    entries.set(record, { record, scope: captureScope, captured, executor });
    calls.set(request.callId, hidden({ kind: "available" as const }, { record }));
    return result;
  }

  async function execute(record: AutomationStudioLlmRerunRecord, request: Readonly<{ callId: string; signal?: AbortSignal }>): Promise<AutomationStudioLlmRerunOutcome> {
    if (disposed) return unrun("disposed");
    const selectedEntry = entries.get(record);
    if (!selectedEntry) return unrun("foreign_record");
    const entry: Entry = selectedEntry;
    const unavailableReason = entryReason(entry);
    if (unavailableReason) return unrun(unavailableReason);
    if (!record.observedEffect || !automationStudioResolvedActionEffectRepeatSafe(record.observedEffect)) return unrun("assessment_unproven");
    if (seen.has(request.callId)) return unrun("duplicate_call");
    seen.add(request.callId);
    calls.set(request.callId, unavailable("capture_missing"));

    let active = true;
    let consumed = false;
    let held = false;
    let reportAttempted = false;
    let dispatch: AutomationStudioLlmRerunCaptureSnapshot["dispatch"] | undefined;
    let dispatchSettled = false;
    let refused: AutomationStudioLlmRerunUnavailableReason | undefined;
    const frame: AutomationStudioLlmRerunFrame = Object.freeze({ kind: "execution", read });
    const assessment = createAutomationStudioLlmRerunAssessment({
      callId: request.callId, toolId: record.toolId, active: () => active,
      execution: {
        envelope: record.observedEffect,
        available: () => active && refused === undefined && entryReason(entry) === undefined,
        held: () => { if (!consumed) held = true; }
      }
    });

    function actual() {
      const main = dispatch ? "receipt" as const : held && !consumed && !reportAttempted ? "unacted" as const : "unproven" as const;
      return dispatch === undefined ? { main } : { main, dispatch };
    }

    function refuse(reason: AutomationStudioLlmRerunUnavailableReason): AutomationStudioLlmRerunExecutionRefused {
      if (!consumed) held = true;
      refused ??= reason;
      revoke(entry, refused);
      return Object.freeze({ kind: "refused", reason: refused });
    }

    function executionReason(): AutomationStudioLlmRerunUnavailableReason | undefined {
      if (!active || automationStudioLlmRerunFrame() !== frame) return "execution_closed";
      return refused ?? entryReason(entry);
    }

    function matches(adapter: AutomationStudioLlmRerunExecutionInput): AutomationStudioLlmRerunUnavailableReason | undefined {
      const closed = executionReason();
      if (closed) return closed;
      try {
        const fields = Object.getOwnPropertyDescriptors(adapter);
        if (fields.owner?.value !== entry.captured.snapshot.owner || fields.generation?.value !== entry.captured.snapshot.generation) return "adapter_changed";
        const adapterValue = fields.value?.value;
        if (adapterValue === undefined) return "adapter_input_changed";
        const value = automationStudioLlmRerunJsonSnapshot(adapterValue);
        return value.kind === "valid" && value.key === entry.captured.adapterKey ? undefined : "adapter_input_changed";
      } catch {
        return "adapter_input_changed";
      }
    }

    function read(adapter: AutomationStudioLlmRerunExecutionInput): AutomationStudioLlmRerunExecutionAccess {
      const mismatch = matches(adapter);
      if (mismatch) return refuse(mismatch);
      if (consumed) return refuse("capsule_consumed");
      return hidden({ kind: "selected" as const, consume, reportDispatch }, { capsule: entry.captured.snapshot.capsule });

      function consume(capsule: object): Readonly<{ kind: "consumed" }> | AutomationStudioLlmRerunExecutionRefused {
        const changed = matches(adapter);
        if (changed) return refuse(changed);
        if (consumed) return refuse("capsule_consumed");
        if (capsule !== entry.captured.snapshot.capsule) return refuse("capsule_changed");
        if (!assessment.proof()) return refuse(assessment.vetoed() ? "assessment_vetoed" : "assessment_unproven");
        consumed = true;
        return Object.freeze({ kind: "consumed" });
      }

      function reportDispatch(capsule: object, report: AutomationStudioLlmRerunCaptureSnapshot["dispatch"]): Readonly<{ kind: "accepted" }> | AutomationStudioLlmRerunExecutionRefused {
        const changed = matches(adapter);
        if (changed) return refuse(changed);
        reportAttempted = true;
        if (capsule !== entry.captured.snapshot.capsule) return refuse("capsule_changed");
        if (!consumed) return refuse("capsule_unconsumed");
        if (dispatch !== undefined) return refuse("dispatch_unproven");
        const fresh = automationStudioLlmRerunReadDispatch(report, false);
        if (fresh.kind !== "valid" || fresh.value.attempts.some((attempt) => attempted.has(attempt.identity) || (attempt.receipt !== undefined && receipted.has(attempt.receipt)))) return refuse("dispatch_unproven");
        dispatch = fresh.value;
        dispatchSettled = fresh.value.attempts.every((attempt) => attempt.outcome === "succeeded" || attempt.outcome === "failed_unacted")
          && fresh.value.attempts[fresh.value.attempts.length - 1]?.outcome === "succeeded";
        rememberDispatch(fresh.value);
        return Object.freeze({ kind: "accepted" });
      }
    }

    const call: AutomationStudioLlmRerunRequest = {
      callId: request.callId,
      toolId: record.toolId,
      value: structuredClone(record.originalValue),
      referenceNow: record.referenceNow
    };
    if (request.signal !== undefined) call.signal = request.signal;
    let result: AutomationStudioLlmRerunResult;
    try {
      result = await runWithAutomationStudioActionAssessments(assessment.scope,
        () => runWithAutomationStudioLlmRerunFrame(frame, () => entry.executor(call)));
    } catch (error) {
      revoke(entry, "result_unproven");
      return hidden({ kind: "threw" as const }, { error, ...actual() });
    } finally {
      active = false;
    }
    const finalReason = refused ?? entryReason(entry)
      ?? (assessment.vetoed() ? "assessment_vetoed" : !assessment.proof() ? "assessment_unproven" : undefined)
      ?? (!consumed ? "capsule_unconsumed" : !dispatchSettled ? "dispatch_unproven" : undefined);
    if (finalReason) {
      revoke(entry, finalReason);
      return hidden({ kind: "unproven" as const, reason: finalReason }, { result, ...actual() });
    }
    return hidden({ kind: "returned" as const }, { result, ...actual() });
  }

  function rememberDispatch(dispatch: AutomationStudioLlmRerunCaptureSnapshot["dispatch"]): void {
    for (const attempt of dispatch.attempts) {
      attempted.add(attempt.identity);
      if (attempt.receipt !== undefined) receipted.add(attempt.receipt);
    }
  }

  function dispose(): void {
    disposed = true;
    calls.clear();
    seen.clear();
    duplicated.clear();
    entries = new WeakMap();
    attempted = new WeakSet();
    receipted = new WeakSet();
  }

  return Object.freeze({ capture, lookup, execute, dispose });
}

function sameScope(left: AutomationStudioLlmRerunScope, right: AutomationStudioLlmRerunScope): boolean {
  return left.loop === right.loop && left.binding === right.binding && left.generation === right.generation
    && left.registry === right.registry && left.authority === right.authority;
}

function identity(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function unavailable(reason: AutomationStudioLlmRerunUnavailableReason): AutomationStudioLlmRerunUnavailable {
  return Object.freeze({ kind: "unavailable", reason });
}

function unrun(reason: AutomationStudioLlmRerunUnavailableReason): AutomationStudioLlmRerunOutcome {
  return hidden({ kind: "unavailable" as const, reason }, { main: "unacted" as const });
}

/** Privacy default for host control records and capsule/result accessors. */
function hidden<T extends object, H extends object>(visible: T, privateFields: H): Readonly<T & H> {
  const descriptors = Object.getOwnPropertyDescriptors(privateFields);
  for (const descriptor of Object.values(descriptors)) descriptor.enumerable = false;
  Object.defineProperties(visible, descriptors);
  return Object.freeze(visible) as Readonly<T & H>;
}
