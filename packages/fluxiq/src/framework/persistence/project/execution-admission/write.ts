import type { AutomationStudioSqlExecutor } from "../sql/index.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
export async function writeExecutionAdmissionEvent(sql: AutomationStudioSqlExecutor, event: ExecutionAdmissionEvent): Promise<void> {
    await sql.run("insert into execution_admission_events(event_id,mutation_id,operation,request_json,changes_json,proof_digest) values(?,?,?,?,?,?)", [event.eventId, event.mutationId, event.operation, JSON.stringify({ ownerId: event.ownerId, value: event.request }), JSON.stringify(event.changes), event.proofDigest]);
    for (const change of event.changes) {
        const encoded = JSON.stringify(change.value);
        if (change.table === "scopes") {
            const value = change.value as import("./rows.ts").ExecutionAdmissionRows["scopes"];
            await sql.run("insert into execution_admission_scopes(scope_id,identity_key,data_json,proof_event_id) values(?,?,?,?) on conflict(scope_id) do update set identity_key=excluded.identity_key,data_json=excluded.data_json,proof_event_id=excluded.proof_event_id", [change.key, value.identity, encoded, event.eventId]);
        }
        else if (change.table === "entries") {
            const value = change.value as import("./rows.ts").ExecutionAdmissionRows["entries"];
            await sql.run("insert into execution_admission_entries(entry_id,scope_id,root_id,parent_id,data_json,proof_event_id) values(?,?,?,?,?,?) on conflict(entry_id) do update set scope_id=excluded.scope_id,root_id=excluded.root_id,parent_id=excluded.parent_id,data_json=excluded.data_json,proof_event_id=excluded.proof_event_id", [change.key, value.row.scopeId, value.row.rootId, value.row.parentId ?? null, encoded, event.eventId]);
        }
        else if (change.table === "fences") {
            await sql.run("insert into execution_admission_fences(resource_key,data_json,proof_event_id) values(?,?,?) on conflict(resource_key) do update set data_json=excluded.data_json,proof_event_id=excluded.proof_event_id", [change.key, encoded, event.eventId]);
        }
        else if (change.table === "facts") {
            const value = change.value as import("./rows.ts").ExecutionAdmissionRows["facts"];
            await sql.run("insert into execution_admission_facts(fact_id,entry_id,data_json,proof_event_id) values(?,?,?,?)", [change.key, value.entryId, encoded, event.eventId]);
        }
        else {
            const value = change.value as import("./rows.ts").ExecutionAdmissionRows["links"];
            await sql.run("insert into execution_admission_command_links(command_id,entry_id,data_json,proof_event_id) values(?,?,?,?)", [change.key, value.entryId, encoded, event.eventId]);
        }
    }
}
