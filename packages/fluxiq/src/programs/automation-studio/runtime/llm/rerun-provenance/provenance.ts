import { automationStudioLlmRerunFrame, runWithAutomationStudioLlmRerunFrame, type AutomationStudioLlmRerunFrame } from "./context.ts";
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
 * This closure does not dispatch, grant permission, retry, or decide effect safety.
 */
export function createAutomationStudioLlmRerunProvenance(input: Readonly<{
  currentScope(): AutomationStudioLlmRerunScope | undefined;
}>): AutomationStudioLlmRerunProvenance {
  let disposed = false;
  let entries = new WeakMap<AutomationStudioLlmRerunRecord, Entry>();
  const calls = new Map<string, AutomationStudioLlmRerunLookup>();
  const seen = new Set<string>();
  const duplicated = new Set<string>();

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
      return Object.freeze({ kind: "accepted" });
    }

    let result: AutomationStudioLlmRerunResult;
    try {
      result = await runWithAutomationStudioLlmRerunFrame(frame, () => executor(request));
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
      originalValue: original.value,
      execution: settlement.execution
    });
    entries.set(record, { record, scope: captureScope, captured, executor });
    calls.set(request.callId, hidden({ kind: "available" as const }, { record }));
    return result;
  }

  async function execute(record: AutomationStudioLlmRerunRecord, request: Readonly<{ callId: string; signal?: AbortSignal }>): Promise<AutomationStudioLlmRerunOutcome> {
    if (disposed) return unavailable("disposed");
    const selectedEntry = entries.get(record);
    if (!selectedEntry) return unavailable("foreign_record");
    const entry: Entry = selectedEntry;
    const unavailableReason = entryReason(entry);
    if (unavailableReason) return unavailable(unavailableReason);
    if (seen.has(request.callId)) return unavailable("duplicate_call");
    seen.add(request.callId);
    calls.set(request.callId, unavailable("capture_missing"));

    let active = true;
    let consumed = false;
    let refused: AutomationStudioLlmRerunUnavailableReason | undefined;
    const frame: AutomationStudioLlmRerunFrame = Object.freeze({ kind: "execution", read });

    function refuse(reason: AutomationStudioLlmRerunUnavailableReason): AutomationStudioLlmRerunExecutionRefused {
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
      return hidden({ kind: "selected" as const, consume }, { capsule: entry.captured.snapshot.capsule });

      function consume(capsule: object): Readonly<{ kind: "consumed" }> | AutomationStudioLlmRerunExecutionRefused {
        const changed = matches(adapter);
        if (changed) return refuse(changed);
        if (consumed) return refuse("capsule_consumed");
        if (capsule !== entry.captured.snapshot.capsule) return refuse("capsule_changed");
        consumed = true;
        return Object.freeze({ kind: "consumed" });
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
      result = await runWithAutomationStudioLlmRerunFrame(frame, () => entry.executor(call));
    } catch (error) {
      revoke(entry, "result_unproven");
      throw error;
    } finally {
      active = false;
    }
    const finalReason = refused ?? entryReason(entry) ?? (!consumed ? "capsule_unconsumed" : undefined);
    if (finalReason) {
      revoke(entry, finalReason);
      return hidden({ kind: "unproven" as const, reason: finalReason }, { result });
    }
    return hidden({ kind: "returned" as const }, { result });
  }

  function dispose(): void {
    disposed = true;
    calls.clear();
    seen.clear();
    duplicated.clear();
    entries = new WeakMap();
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

/** Privacy default for host control records and capsule/result accessors. */
function hidden<T extends object, H extends object>(visible: T, privateFields: H): Readonly<T & H> {
  const descriptors = Object.getOwnPropertyDescriptors(privateFields);
  for (const descriptor of Object.values(descriptors)) descriptor.enumerable = false;
  Object.defineProperties(visible, descriptors);
  return Object.freeze(visible) as Readonly<T & H>;
}
