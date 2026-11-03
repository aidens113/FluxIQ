import type { AutomationStudioSqlExecutor } from "../sql/index.ts";
import { automationStudioMutationDigest as digest } from "../mutations/index.ts";
import { executionRecord } from "../../../../runtime/execution-admission/validation/index.ts";
import { executionAdmissionDecode } from "./codec.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
export function executionAdmissionEventDigest(event: Omit<ExecutionAdmissionEvent, "proofDigest">): string {
    return digest({ eventId: event.eventId, mutationId: event.mutationId, ownerId: event.ownerId, operation: event.operation, request: event.request, changes: event.changes });
}
export async function verifyExecutionAdmissionEvent(sql: AutomationStudioSqlExecutor, event: ExecutionAdmissionEvent, mutationRows?: ReadonlyMap<string, Readonly<Record<string, unknown>>>): Promise<void> {
    if (executionAdmissionEventDigest(event) !== event.proofDigest)
        throw new Error("execution_admission.corrupt_event");
    const row = mutationRows ? mutationRows.get(event.mutationId) : await sql.get<Record<string, unknown>>("select * from mutation_records where mutation_id=?", [event.mutationId]);
    if (!row || row.status !== "committed" || row.response_json === null || row.owner_id !== event.ownerId)
        throw new Error("execution_admission.corrupt_mutation_join");
    const response = executionAdmissionDecode(row.response_json);
    if (event.operation === "command_link") {
        const request = executionRecord(event.request, ["claimDigest"], ["claimDigest"], "link_request");
        const value = executionRecord(response, ["commandId", "operation", "proofDigest", "executionLinkDigest"], ["commandId", "operation", "proofDigest", "executionLinkDigest"], "claim_proof");
        if (row.owner_kind !== "gateway_command" || row.operation_kind !== "gateway_command.claim" || row.request_digest !== request.claimDigest || value.commandId !== event.ownerId || value.operation !== "claim" || value.executionLinkDigest !== event.proofDigest || event.mutationId !== `${event.ownerId}.claim`)
            throw new Error("execution_admission.corrupt_claim_link_join");
    }
    else {
        const expected = { eventId: event.eventId, operation: event.operation, proofDigest: event.proofDigest };
        if (row.owner_kind !== "execution_admission" || row.operation_kind !== `execution_admission.${event.operation}` || row.request_digest !== digest({ operation: event.operation, request: event.request }) || digest(response) !== digest(expected))
            throw new Error("execution_admission.corrupt_mutation_join");
    }
}
