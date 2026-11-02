import type { AutomationStudioSqlExecutor } from "../database.ts";
import { automationStudioMutationDigest as digest } from "../unit-of-work.ts";
import { ClientGatewayCommandLedgerController as CommandRules } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { executionRecord } from "../../../../../runtime/execution-admission/validation/index.ts";
import { executionAdmissionDecode, executionAdmissionEventValue, executionAdmissionKey, executionAdmissionRow } from "./codec.ts";
import { verifyExecutionAdmissionEvent } from "./proof.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
import type { ExecutionAdmissionSnapshot } from "./snapshot.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
import { executionAdmissionFrontier } from "./state.ts";
const LIMIT = 4096;
export async function readExecutionAdmissionInventory(context: ExecutionAdmissionStorageContext, sql: AutomationStudioSqlExecutor): Promise<ExecutionAdmissionSnapshot> {
    const rows: ExecutionAdmissionSnapshot["rows"] = { scopes: new Map(), entries: new Map(), fences: new Map(), facts: new Map(), links: new Map() };
    const events = new Map<string, ExecutionAdmissionEvent>();
    const mutations = new Set<string>();
    let bytes = 0;
    const readRows = async <T extends Record<string, unknown>>(table: string, order: string, where = ""): Promise<T[]> => {
        const found = await sql.all<T>(`select * from ${table} ${where} order by ${order} limit ?`, [LIMIT + 1]);
        if (found.length > LIMIT)
            throw new Error("execution_admission.inventory_overflow");
        bytes += found.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row), "utf8"), 0);
        if (bytes > 64 * 1024 * 1024)
            throw new Error("execution_admission.inventory_size_limit");
        return found;
    };
    for (const raw of await readRows("execution_admission_events", "sequence")) {
        const request = executionRecord(executionAdmissionDecode(raw.request_json, 16 * 1024 * 1024), ["ownerId", "value"], ["ownerId", "value"], "event_request");
        const event = executionAdmissionEventValue({ eventId: raw.event_id, mutationId: raw.mutation_id, ownerId: request.ownerId, operation: raw.operation, request: request.value, changes: executionAdmissionDecode(raw.changes_json, 16 * 1024 * 1024), proofDigest: raw.proof_digest });
        if (events.has(event.eventId) || mutations.has(event.mutationId))
            throw new Error("execution_admission.duplicate_proof");
        await verifyExecutionAdmissionEvent(sql, event);
        events.set(event.eventId, event);
        mutations.add(event.mutationId);
        for (const change of event.changes)
            apply(rows, change);
    }
    const definitions = [
        ["scopes", "scope_id"], ["entries", "entry_id"], ["fences", "resource_key"], ["facts", "fact_id"], ["links", "command_id"]
    ] as const;
    for (const [table, key] of definitions) {
        const sqlTable = table === "links" ? "execution_admission_command_links" : `execution_admission_${table}`;
        const actual = await readRows(sqlTable, key);
        if (actual.length !== rows[table].size)
            throw new Error("execution_admission.missing_materialized_join");
        for (const raw of actual) {
            const parsed = executionAdmissionRow(table, executionAdmissionDecode(raw.data_json));
            const id = executionAdmissionKey(table, parsed);
            if (raw[key] !== id || raw.proof_event_id !== parsed.proofEventId || digest(rows[table].get(id)) !== digest(parsed))
                throw new Error("execution_admission.corrupt_materialized_join");
            if (table === "scopes" && raw.identity_key !== (parsed as ExecutionAdmissionRows["scopes"]).identity)
                throw new Error("execution_admission.corrupt_scope_key");
            if (table === "entries") {
                const entry = parsed as ExecutionAdmissionRows["entries"];
                if (raw.scope_id !== entry.row.scopeId || raw.root_id !== entry.row.rootId || raw.parent_id !== (entry.row.parentId ?? null))
                    throw new Error("execution_admission.corrupt_entry_key");
            }
            if ((table === "facts" || table === "links") && raw.entry_id !== (parsed as ExecutionAdmissionRows["facts"] | ExecutionAdmissionRows["links"]).entryId)
                throw new Error("execution_admission.corrupt_entry_join");
        }
    }
    for (const row of await readRows("mutation_records", "mutation_id", "where owner_kind='execution_admission' or operation_kind like 'execution_admission.%' or mutation_id like 'execution.%'")) {
        if (row.owner_kind !== "execution_admission" || typeof row.operation_kind !== "string" || !/^execution_admission\.(open|reserve|enter|append|finish|release)$/u.test(row.operation_kind) || typeof row.request_digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(row.request_digest))
            throw new Error("execution_admission.invalid_mutation_inventory");
        if (row.status === "committed") {
            if (typeof row.mutation_id !== "string" || !mutations.has(row.mutation_id))
                throw new Error("execution_admission.orphan_mutation");
        }
        else if (row.status !== "failed" || row.response_json !== null || typeof row.error_json !== "string") {
            throw new Error("execution_admission.invalid_mutation_status");
        }
    }
    const commands = await context.commands.readExecutionInventory(sql);
    const snapshot = { rows, events, commands: commands.records, historicalUnknownCommandIds: commands.historicalUnknownCommandIds };
    validateJoins(context.lease.projectId, snapshot);
    return snapshot;
}
function apply(rows: ExecutionAdmissionSnapshot["rows"], change: ExecutionAdmissionEvent["changes"][number]): void {
    const target = rows[change.table] as Map<string, ExecutionAdmissionRows[keyof ExecutionAdmissionRows]>;
    if ((change.table === "facts" || change.table === "links") && target.has(change.key))
        throw new Error("execution_admission.immutable_row_rewritten");
    target.set(change.key, change.value);
}
function validateJoins(projectId: string, snapshot: ExecutionAdmissionSnapshot): void {
    const { scopes, entries, fences, facts, links } = snapshot.rows;
    const identities = new Set<string>();
    for (const scope of scopes.values()) {
        const identity = digest({ projectId: scope.binding.projectId, ownerKey: scope.binding.ownerKey, continuationKey: scope.binding.continuationKey });
        if (scope.binding.projectId !== projectId || scope.identity !== identity || scope.scopeId !== `scope.${identity.slice(7)}` || identities.has(identity))
            throw new Error("execution_admission.corrupt_scope_identity");
        identities.add(identity);
    }
    for (const entry of entries.values()) {
        const root = entries.get(entry.row.rootId);
        if (!scopes.has(entry.row.scopeId) || !root || root.row.parentId !== undefined || root.row.rootId !== root.row.entryId || root.row.scopeId !== entry.row.scopeId || root.row.ownerIncarnation !== entry.row.ownerIncarnation || root.fenceGeneration !== entry.fenceGeneration || digest(root.row.resourceKeys) !== digest(entry.row.resourceKeys))
            throw new Error("execution_admission.corrupt_root_join");
        if (entry.row.parentId !== undefined) {
            const parent = entries.get(entry.row.parentId);
            if (!parent || parent.row.rootId !== root.row.entryId || parent.row.scopeId !== entry.row.scopeId || entry.row.seriesKey !== undefined)
                throw new Error("execution_admission.corrupt_parent_join");
        }
        const seen = new Set<string>();
        let current: ExecutionAdmissionRows["entries"] | undefined = entry;
        while (current) {
            if (seen.has(current.row.entryId) || seen.size >= 256)
                throw new Error("execution_admission.corrupt_ancestry");
            seen.add(current.row.entryId);
            current = current.row.parentId === undefined ? undefined : entries.get(current.row.parentId);
        }
        if (root.active) {
            for (const resource of root.row.resourceKeys) {
                const fence = fences.get(resource);
                if (!fence || fence.rootId !== root.row.entryId || fence.ownerIncarnation !== root.row.ownerIncarnation || fence.fenceGeneration !== root.fenceGeneration)
                    throw new Error("execution_admission.corrupt_active_fence");
            }
        }
        if (entry.closure !== null && executionAdmissionFrontier(snapshot, entry.row.entryId) !== entry.frontierDigest)
            throw new Error("execution_admission.frontier_changed");
    }
    for (const fence of fences.values()) {
        if (fence.rootId === null)
            continue;
        const root = entries.get(fence.rootId);
        if (!root || !root.active || !root.row.resourceKeys.includes(fence.resourceKey) || root.row.ownerIncarnation !== fence.ownerIncarnation || root.fenceGeneration !== fence.fenceGeneration)
            throw new Error("execution_admission.dangling_fence");
    }
    for (const fact of facts.values())
        if (!entries.has(fact.entryId))
            throw new Error("execution_admission.orphan_fact");
    for (const link of links.values()) {
        const entry = entries.get(link.entryId);
        const command = snapshot.commands.find(item => item.claim.binding.commandId === link.commandId);
        if (!entry || !command || link.scopeId !== entry.row.scopeId || link.rootId !== entry.row.rootId || link.fenceGeneration !== entry.fenceGeneration || link.originDigest !== digest(entry.row) || link.claimDigest !== CommandRules.digest(command.claim) || command.claim.binding.projectId !== projectId || entry.row.origin.operationKey !== link.commandId)
            throw new Error("execution_admission.corrupt_command_join");
    }
}
