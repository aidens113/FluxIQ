import type { ExecutionEntryRow } from "../../../../runtime/execution-admission/index.ts";
import { executionBinding, executionEvidence, executionOrigin, executionRecord, executionResources, executionText } from "../../../../runtime/execution-admission/validation/index.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
export function executionAdmissionDecode(text: unknown, maximumBytes = 4 * 1024 * 1024): unknown {
    if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maximumBytes)
        throw new Error("execution_admission.invalid_record_size");
    try {
        return JSON.parse(text) as unknown;
    }
    catch {
        throw new Error("execution_admission.corrupt_json");
    }
}
export function executionAdmissionEntry(value: unknown): ExecutionEntryRow {
    const required = ["entryId", "scopeId", "rootId", "resourceKeys", "sourceKey", "origin", "ownerIncarnation"];
    const row = executionRecord(value, [...required, "parentId", "seriesKey"], required, "entry_row");
    const entry: ExecutionEntryRow = {
        entryId: executionText(row.entryId, "entry"), scopeId: executionText(row.scopeId, "scope"), rootId: executionText(row.rootId, "root"),
        resourceKeys: executionResources(row.resourceKeys), sourceKey: executionText(row.sourceKey, "source"),
        origin: executionOrigin(row.origin, executionText(row.sourceKey, "source")), ownerIncarnation: executionText(row.ownerIncarnation, "incarnation")
    };
    if (row.parentId !== undefined)
        Object.assign(entry, { parentId: executionText(row.parentId, "parent") });
    if (row.seriesKey !== undefined)
        Object.assign(entry, { seriesKey: executionText(row.seriesKey, "series") });
    return entry;
}
export function executionAdmissionRow<K extends keyof ExecutionAdmissionRows>(table: K, value: unknown): ExecutionAdmissionRows[K] {
    const proof = (row: Record<string, unknown>) => executionText(row.proofEventId, "proof_event");
    let parsed: ExecutionAdmissionRows[keyof ExecutionAdmissionRows];
    if (table === "scopes") {
        const keys = ["scopeId", "identity", "binding", "baseline", "baselineProofDigest", "revision", "proofEventId"];
        const row = executionRecord(value, keys, keys, "scope_row");
        if (row.baseline !== "complete" && row.baseline !== "unverified")
            throw new Error("execution_admission.invalid_baseline");
        parsed = { scopeId: executionText(row.scopeId, "scope"), identity: executionText(row.identity, "identity"), binding: executionBinding(row.binding), baseline: row.baseline, baselineProofDigest: executionText(row.baselineProofDigest, "baseline_proof"), revision: revision(row.revision), proofEventId: proof(row) };
    }
    else if (table === "entries") {
        const keys = ["row", "enteredLive", "revision", "fenceGeneration", "active", "closure", "frontierDigest", "proofEventId"];
        const row = executionRecord(value, keys, keys, "stored_entry");
        const closure = row.closure === null ? null : executionEvidence(row.closure);
        if (closure !== null && closure.kind !== "coverage_complete")
            throw new Error("execution_admission.invalid_closure");
        if ((closure === null) !== (row.frontierDigest === null))
            throw new Error("execution_admission.invalid_frontier");
        parsed = { row: executionAdmissionEntry(row.row), enteredLive: flag(row.enteredLive), revision: revision(row.revision), fenceGeneration: executionText(row.fenceGeneration, "fence"), active: flag(row.active), closure, frontierDigest: nullableText(row.frontierDigest), proofEventId: proof(row) };
    }
    else if (table === "fences") {
        const keys = ["resourceKey", "revision", "rootId", "ownerIncarnation", "fenceGeneration", "proofEventId"];
        const row = executionRecord(value, keys, keys, "fence_row");
        if ((row.rootId === null) !== (row.ownerIncarnation === null) || (row.rootId === null) !== (row.fenceGeneration === null))
            throw new Error("execution_admission.invalid_fence");
        parsed = { resourceKey: executionText(row.resourceKey, "resource"), revision: revision(row.revision), rootId: nullableText(row.rootId), ownerIncarnation: nullableText(row.ownerIncarnation), fenceGeneration: nullableText(row.fenceGeneration), proofEventId: proof(row) };
    }
    else if (table === "facts") {
        const keys = ["factId", "entryId", "evidence", "proofEventId"];
        const row = executionRecord(value, keys, keys, "fact_row");
        const evidence = executionEvidence(row.evidence);
        if (evidence.kind === "coverage_complete")
            throw new Error("execution_admission.finish_required");
        parsed = { factId: executionText(row.factId, "fact"), entryId: executionText(row.entryId, "entry"), evidence, proofEventId: proof(row) };
    }
    else if (table === "links") {
        const keys = ["commandId", "entryId", "scopeId", "rootId", "required", "fenceGeneration", "originDigest", "claimDigest", "proofEventId"];
        const row = executionRecord(value, keys, keys, "command_link");
        parsed = { commandId: executionText(row.commandId, "command"), entryId: executionText(row.entryId, "entry"), scopeId: executionText(row.scopeId, "scope"), rootId: executionText(row.rootId, "root"), required: flag(row.required), fenceGeneration: executionText(row.fenceGeneration, "fence"), originDigest: executionText(row.originDigest, "origin_digest"), claimDigest: executionText(row.claimDigest, "claim_digest"), proofEventId: proof(row) };
    }
    else {
        throw new Error("execution_admission.invalid_table");
    }
    // The table discriminator above validates every field before restoring its mapped type.
    return parsed as ExecutionAdmissionRows[K];
}
export function executionAdmissionKey(table: keyof ExecutionAdmissionRows, row: ExecutionAdmissionRows[keyof ExecutionAdmissionRows]): string {
    const value = row as unknown as Record<string, unknown>;
    if (table === "entries")
        return executionAdmissionEntry(value.row).entryId;
    const key = table === "scopes" ? "scopeId" : table === "fences" ? "resourceKey" : table === "facts" ? "factId" : "commandId";
    return executionText(value[key], "row_key");
}
export function executionAdmissionEventValue(value: unknown): ExecutionAdmissionEvent {
    const keys = ["eventId", "mutationId", "ownerId", "operation", "request", "changes", "proofDigest"];
    const row = executionRecord(value, keys, keys, "event");
    if (!Array.isArray(row.changes) || row.changes.length === 0 || row.changes.length > 512)
        throw new Error("execution_admission.invalid_changes");
    const operation = row.operation;
    if (operation !== "open" && operation !== "reserve" && operation !== "enter" && operation !== "append" && operation !== "finish" && operation !== "release" && operation !== "command_link")
        throw new Error("execution_admission.invalid_operation");
    const changes = row.changes.map((value): ExecutionAdmissionEvent["changes"][number] => {
        const change = executionRecord(value, ["table", "key", "value"], ["table", "key", "value"], "change");
        const table = change.table;
        if (table !== "scopes" && table !== "entries" && table !== "fences" && table !== "facts" && table !== "links")
            throw new Error("execution_admission.invalid_table");
        const parsed = executionAdmissionRow(table, change.value);
        const key = executionText(change.key, "change_key");
        if (executionAdmissionKey(table, parsed) !== key || parsed.proofEventId !== row.eventId)
            throw new Error("execution_admission.invalid_change_join");
        return { table, key, value: parsed };
    });
    return { eventId: executionText(row.eventId, "event"), mutationId: executionText(row.mutationId, "mutation"), ownerId: executionText(row.ownerId, "owner"), operation, request: row.request, changes, proofDigest: executionText(row.proofDigest, "proof_digest") };
}
function flag(value: unknown): boolean {
    if (typeof value !== "boolean")
        throw new Error("execution_admission.invalid_flag");
    return value;
}
function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || typeof value !== "number" || value < 0)
        throw new Error("execution_admission.invalid_revision");
    return value;
}
function nullableText(value: unknown): string | null {
    return value === null ? null : executionText(value, "nullable_text");
}
